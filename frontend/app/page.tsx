// Landing page (server component). Phase 1 stub.
export default function Home() {
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">DataAutomated.io</h1>
      <p className="text-gray-600">
        Client Intelligence Portal — Phase 1 scaffold. The dashboard and the five core
        pages are implemented in Phase 8 (FRONTEND_ARCHITECTURE.md).
      </p>
      <ul className="list-disc pl-6 text-gray-600">
        <li>/dashboard — overview of all three services</li>
        <li>/insights — Voice-of-Customer</li>
        <li>/signals — Competitive Signals</li>
        <li>/journeys — Behavioral Journey</li>
      </ul>
    </main>
  );
}
