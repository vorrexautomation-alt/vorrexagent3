// JoinResolver — tracks, for one run of a workflow, which edges have
// fired (carried real data) or been skipped (the upstream node ran but
// didn't emit on that port — e.g. an If node's "false" branch when the
// condition was true), and decides when a downstream node has all the
// information it needs to run.
//
// This is the actual fix for the correctness gap flagged in the Phase 0
// audit: the old runtime ran a "merge" node once per incoming branch
// that happened to fire, instead of waiting for all of them. The fix
// generalizes past just the merge node — ANY node with more than one
// incoming edge (see planner.ts's isJoinNode) now gets real join
// semantics: it only runs once every incoming edge has resolved one way
// or the other, and it receives every branch that actually fired, not
// just whichever arrived first.
//
// The hard part join semantics have to get right in a graph with
// conditional branching: a downstream join node can have an incoming
// edge from a branch that will NEVER fire (the If node took the other
// path). Waiting for literally every wired edge to carry data would
// deadlock forever. The fix is a skip signal that propagates through the
// graph exactly like data does — a node that receives ALL of its inputs
// as skips is itself skipped, and its own outgoing edges become skips
// for whatever's downstream of it, and so on — so a join node only ever
// waits for branches that are actually reachable in this particular run.
//
// Pure and side-effect-free: no I/O, no timers, no async. This is what
// makes it usable identically from the in-process synchronous debug run
// (runtime.ts, one JoinResolver instance per run, lives in memory for
// the run's duration) and from the durable BullMQ engine (lib/queue/),
// which reconstructs an equivalent resolver's state from
// workflow_run_nodes rows on every node-completion job rather than
// keeping one long-lived instance — see lib/queue/worker.ts.

import { ExecutionPlan, isJoinNode } from "./planner";
import { NodeData } from "./types";

export type EdgeResolution = { fired: true; data: NodeData } | { fired: false };

export interface ReadyNode {
  nodeId: string;
  // Single value for a normal (non-join) node — exactly the pre-Phase-3
  // calling convention, so every existing executor is unaffected.
  // Array of every branch's data, in edge-definition order, for a join
  // node (indegree > 1) that had at least one edge fire.
  input: NodeData | NodeData[];
}

export class JoinResolver {
  private plan: ExecutionPlan;
  private resolved = new Map<string, EdgeResolution>(); // edgeId -> resolution
  private dispatched = new Set<string>(); // nodeIds already handed back as ready, so they're never returned twice

  constructor(plan: ExecutionPlan) {
    this.plan = plan;
  }

  // Call once, for every trigger node a run starts at, before pulling
  // any ready nodes — trigger nodes have no incoming edges so nothing
  // needs to "fire" for them; they're ready immediately.
  seedTrigger(nodeId: string, data: NodeData): ReadyNode {
    this.dispatched.add(nodeId);
    return { nodeId, input: data };
  }

  // Records that `nodeId` finished and emitted on `emittedPorts` (each
  // with its data). Any OTHER port this node has a wired outgoing edge
  // on (per the plan) — one it did NOT emit on this run — is recorded as
  // skipped. Returns every downstream node that just became ready as a
  // result (i.e. had its last unresolved incoming edge resolved by this
  // completion), each exactly once.
  recordCompletion(nodeId: string, emissions: Array<{ port: string; data: NodeData }>): ReadyNode[] {
    const wiredPorts = this.plan.wiredOutputPorts.get(nodeId) ?? new Set<string>();
    const fanOutReady: ReadyNode[] = [];

    for (const port of wiredPorts) {
      const edges = (this.plan.edgesBySource.get(nodeId) ?? []).filter((e) => (e.sourceHandle || "out") === port);
      const values = emissions.filter((e) => e.port === port).map((e) => e.data);

      if (values.length === 0) {
        for (const edge of edges) this.resolved.set(edge.id, { fired: false });
        continue;
      }

      if (values.length === 1) {
        for (const edge of edges) this.resolved.set(edge.id, { fired: true, data: values[0] });
        continue;
      }

      // More than one emission on the SAME port from a single
      // completion — today only the "loop" node does this (one "loop"
      // emission per batch; see its own comment in executors/index.ts).
      // This resolver's model is otherwise "each edge fires at most
      // once per run," which doesn't fit that. Handled here, not
      // silently dropped (an earlier version of this method used
      // `.find()`, which kept only the FIRST batch and threw the rest
      // away — caught before shipping, not a real bug that went out):
      //   - A target with only this one incoming edge (the common case:
      //     Loop -> some processing node) gets a direct fan-out
      //     dispatch per batch, preserving the pre-Phase-3 "runs once
      //     per batch, in order" behavior.
      //   - A target that's ITSELF a join node (has other incoming
      //     edges too) can't get true per-batch join semantics from a
      //     resolver where each edge resolves once — only the LAST
      //     batch's data is used for this edge's contribution. This is
      //     a narrowing, not a fix, of the loop node's own pre-existing
      //     documented simplification ("no barrier... every item still
      //     reaches loop exactly once") — see
      //     docs/phase3-execution-engine.md.
      for (const edge of edges) {
        if (isJoinNode(this.plan, edge.target)) {
          this.resolved.set(edge.id, { fired: true, data: values[values.length - 1] });
        } else {
          for (const value of values) fanOutReady.push({ nodeId: edge.target, input: value });
          // Prevent collectNewlyReady's normal single-firing path from
          // ALSO dispatching this target once more once its other
          // incoming edges (if it has none, this is a no-op) resolve.
          this.dispatched.add(edge.target);
        }
      }
    }

    return [...fanOutReady, ...this.collectNewlyReady(nodeId)];
  }

  // Records that `nodeId` errored (or was itself skipped without ever
  // running). Every one of its wired outgoing edges resolves as skipped
  // — an error propagates as "this branch produced nothing", the same
  // as a not-taken If branch, so downstream join nodes don't hang
  // waiting on a branch that failed instead of one that was never taken.
  recordSkippedOrFailed(nodeId: string): ReadyNode[] {
    return this.resolveOutgoingAsSkipped(nodeId);
  }

  private resolveOutgoingAsSkipped(nodeId: string): ReadyNode[] {
    const wiredPorts = this.plan.wiredOutputPorts.get(nodeId) ?? new Set<string>();
    for (const port of wiredPorts) {
      const edges = (this.plan.edgesBySource.get(nodeId) ?? []).filter((e) => (e.sourceHandle || "out") === port);
      for (const edge of edges) this.resolved.set(edge.id, { fired: false });
    }
    return this.collectNewlyReady(nodeId);
  }

  private collectNewlyReady(fromNodeId: string): ReadyNode[] {
    const ready: ReadyNode[] = [];
    const candidateTargets = new Set((this.plan.edgesBySource.get(fromNodeId) ?? []).map((e) => e.target));

    for (const targetId of candidateTargets) {
      if (this.dispatched.has(targetId)) continue;
      const incoming = this.plan.edgesByTarget.get(targetId) ?? [];
      const allResolved = incoming.every((e) => this.resolved.has(e.id));
      if (!allResolved) continue;

      const firedCount = incoming.filter((e) => this.resolved.get(e.id)!.fired).length;

      if (firedCount === 0) {
        // Every incoming edge resolved, none fired: this node is itself
        // fully skipped and never runs. Mark it dispatched (so it's
        // never reconsidered) and recursively propagate the skip signal
        // through ITS outgoing edges — a chain of unreached nodes
        // collapses to nothing, rather than stalling the first join
        // node it happens to reach.
        this.dispatched.add(targetId);
        ready.push(...this.resolveOutgoingAsSkipped(targetId));
        continue;
      }

      this.dispatched.add(targetId);
      const join = isJoinNode(this.plan, targetId);
      const dataInEdgeOrder = incoming
        .filter((e) => this.resolved.get(e.id)!.fired)
        .map((e) => (this.resolved.get(e.id) as { fired: true; data: NodeData }).data);

      ready.push({ nodeId: targetId, input: join ? dataInEdgeOrder : dataInEdgeOrder[0] });
    }

    return ready;
  }
}
