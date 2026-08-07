'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { santafeImages } from '@/lib/santafeImages';

function ImageCard({ item }: { item: typeof santafeImages[number] }) {
  const [failed, setFailed] = useState(false);
  const initials = useMemo(() => item.title.split(' ').slice(0, 2).map((word) => word[0]).join(''), [item.title]);

  return (
    <article className="card flex min-h-full flex-col overflow-hidden border-fundesco-line">
      <div className="relative aspect-[4/3] bg-fundesco-mist">
        {!failed ? (
          <Image
            src={item.src}
            alt={item.alt}
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full min-h-[240px] flex-col justify-end bg-gradient-to-br from-fundesco-forest to-fundesco-green p-6 text-white">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-xl font-bold">{initials}</div>
            <p className="text-xl font-bold">{item.title}</p>
            <p className="mt-2 text-sm text-white/85">Bloque de respaldo visible solo si el archivo local no está disponible.</p>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-fundesco-forest">{item.title}</h3>
          <p className="line-clamp-4 text-sm leading-6 text-fundesco-slate">{item.caption}</p>
        </div>
        <div className="mt-auto space-y-1 text-xs leading-5 text-fundesco-muted">
          <p>{item.credit}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <a href={item.source} target="_blank" rel="noreferrer" className="font-semibold text-fundesco-green underline underline-offset-2">
              Ver fuente
            </a>
            <a href={item.licenseUrl} target="_blank" rel="noreferrer" className="font-semibold text-fundesco-forest underline underline-offset-2">
              {item.license}
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function SantafeContextGallery() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-6" aria-label="Contexto territorial de Santa Fe" lang="es">
      <div className="card p-6 md:p-8">
        <div className="mb-8 flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-fundesco-green">Galería territorial</p>
          <h2 className="text-3xl font-bold text-fundesco-forest">Contexto territorial de Santa Fe</h2>
          <p className="max-w-3xl text-sm leading-6 text-fundesco-slate">
            Esta galeria complementa la lectura estadistica con referentes urbanos, patrimoniales y paisajisticos que ayudan a contextualizar la oferta observada en la localidad.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {santafeImages.map((item) => (
            <ImageCard key={item.key} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
