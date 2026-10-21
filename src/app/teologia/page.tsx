import CourseList from "@/components/CourseList";
import LiveRoom from "@/components/LiveRoom";
import { getCourses } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const courses = await getCourses("teologia");
  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Estudos de Teologia</h1>
        <p className="text-sm text-slate-500">Curso básico de teologia pastoral e exegese.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <LiveRoom mode="interativo" room="teologia" title="Aula de teologia ao vivo" />
        <CourseList courses={courses} />
      </div>
    </>
  );
}
