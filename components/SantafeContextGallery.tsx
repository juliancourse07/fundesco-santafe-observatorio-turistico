'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { santafeImages } from '@/lib/santafeImages';

function ImageCard({ item }: { item: typeof santafeImages[number] }) {
  const [failed, setFailed] = useState(false);
  const initials = useMemo(() => item.title.split(' ').slice(0, 2).map((word) => word[0]).join(''), [item.title]);

  return (
    <article className="rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="relative h-56 bg-slate-100">
        {!failed ? (
          <Image
            src={item.src}
            alt={item.caption}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-fundesco-forest to-fundesco-green text-white text-center p-6">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl font-black mb-3">{initials}</div>
            <p className="font-bold">Imagen de contexto no disponible</p>
            <p className="text-sm text-white/80 mt-2">La tarjeta conserva la referencia curada y muestra un placeholder hasta agregar el archivo libre definitivo.</p>
          </div>
        )}
      </div>
      <div className="p-5 space-y-2">
        <h3 className="text-lg font-bold text-fundesco-forest">{item.title}</h3>
        <p className="text-sm text-slate-700 text-justify [hyphens:auto]">{item.caption}</p>
        <p className="text-xs text-slate-500">{item.credit}</p>
        <a href={item.source} target="_blank" rel="noreferrer" className="text-xs font-semibold text-fundesco-green underline underline-offset-2">
          Ver fuente y licencia de referencia
        </a>
      </div>
    </article>
  );
}

export default function SantafeContextGallery() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-4" aria-label="Contexto territorial de Santa Fe" lang="es">
      <div className="card p-6">
        <div className="flex flex-col gap-2 mb-6">
          <h2 className="text-2xl font-bold text-fundesco-forest">Contexto territorial de Santa Fe</h2>
          <p className="text-sm text-slate-600 text-justify [hyphens:auto]">
            Esta galeria complementa la lectura estadistica con referentes urbanos, patrimoniales y paisajisticos que ayudan a contextualizar la oferta observada en la localidad.
          </p>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
          {santafeImages.map((item) => (
            <ImageCard key={item.key} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
