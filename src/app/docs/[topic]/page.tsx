import Link from "next/link";
import { notFound } from "next/navigation";
import { documents } from "@/lib/docs";
export function generateStaticParams() {
  return Object.keys(documents).map((topic) => ({ topic }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  const doc = documents[topic];
  if (!doc) notFound();
  return (
    <article className="docs">
      <div className="eyebrow">THE RAXLET HANDBOOK</div>
      <h1>{doc.title}</h1>
      <p>{doc.intro}</p>
      <nav className="docs-nav">
        {Object.entries(documents).map(([key, v]) => (
          <Link
            key={key}
            href={`/docs/${key}`}
            className={`badge ${key === topic ? "green" : ""}`}
          >
            {v.title}
          </Link>
        ))}
      </nav>
      {doc.sections.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          {s.paragraphs?.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s.items && (
            <ul>
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {s.code && (
            <pre>
              <code>{s.code}</code>
            </pre>
          )}
        </section>
      ))}
    </article>
  );
}
