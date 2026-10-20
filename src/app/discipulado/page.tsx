import CourseList from "@/components/CourseList";
import LiveRoom from "@/components/LiveRoom";
import { getCourses } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const courses = await getCourses("discipulado");
  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Discipulado</h1>
        <p className="text-sm text-slate-500">Trilhas de formação 1-para-1 e vida cristã prática.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <LiveRoom room="discipulado" title="Aula de discipulado ao vivo" />
        <CourseList courses={courses} />
      </div>
    </>
  );
}
