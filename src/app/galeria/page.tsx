import GalleryUpload from "@/components/GalleryUpload";
import { getGaleria } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const fotos = await getGaleria();
  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Galeria de momentos do Vale</h1>
        <p className="text-sm text-slate-500">Batismos, conferências e comunhão.</p>
      </div>
      <GalleryUpload />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fotos.map((f) => (
          <figure key={f.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.imagem_url} alt={f.titulo} className="h-48 w-full object-cover" loading="lazy" />
              {f.categoria && (
                <span className="absolute left-3 top-3 rounded-full bg-brand-terracotta px-3 py-1 text-xs font-bold text-white">{f.categoria}</span>
              )}
            </div>
            <figcaption className="p-4">
              <h3 className="font-semibold">{f.titulo}</h3>
              <p className="text-sm text-slate-500">{f.descricao}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
