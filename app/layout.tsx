import "./globals.css";

export const metadata = { title: "Vorrex Agents" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0A0A12", color: "#F5F5FA", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
