type Course = { id: number; titulo: string; descricao: string | null; formato: string | null; lessons: { id: number; titulo: string; video_url: string | null }[] };

export default function CourseList({ courses }: { courses: Course[] }) {
  return (
    <ul className="space-y-3">
      {courses.map((c) => (
        <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800">{c.titulo}</h3>
              <p className="text-sm text-slate-500">{c.descricao}</p>
            </div>
            {c.formato && <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{c.formato}</span>}
          </div>
          {c.lessons.length > 0 && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {c.lessons.map((l) => (
                <li key={l.id}>
                  {l.video_url ? <a href={l.video_url} target="_blank" className="text-brand-terracotta underline">{l.titulo}</a> : l.titulo}
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}
