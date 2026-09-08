import { Card } from "./Chrome";

export function SetupNotice({ error }: { error?: string }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold">No database connected</h2>
      <p className="mt-2 text-sm text-muted">
        Set <code className="tabular">DATABASE_URL</code> in the environment, then run{" "}
        <code className="tabular">npm run db:setup</code> to create the schema and seed the category taxonomy.
      </p>
      {error && <p className="mt-3 text-sm text-fail">{error}</p>}
    </Card>
  );
}
