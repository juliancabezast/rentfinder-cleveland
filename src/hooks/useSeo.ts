import { useEffect } from "react";

/**
 * Mete título, descripción y canonical por ruta en el SPA.
 *
 * POR QUÉ EXISTE
 * `index.html` trae un solo juego de metadatos, así que las 23 rutas públicas
 * del SPA compartían el mismo `<title>` y — peor — todas declaraban
 * `<link rel="canonical" href="https://rentfindercleveland.com/">`. Eso le dice
 * a Google que cada una es un duplicado del home, y Google le hace caso: ni
 * /saas (la captación de propietarios) ni /p/book-showing (el paso de
 * conversión del inquilino) podían indexarse. Además había cinco pares de
 * rutas que sirven el mismo contenido en dos URLs distintas, sin nada que
 * dijera cuál es la buena.
 *
 * ESTO NO ES SSR. El HTML inicial sigue llegando vacío; lo que corrige es lo
 * que Googlebot ve *después* de ejecutar el JS, que es cuando de verdad lee la
 * página. Para el contenido que tiene que rankear, el patrón del sitio sigue
 * siendo la página estática en public/ — mucho más fiable que depender de que
 * el crawler renderice.
 *
 * Restaura lo anterior al desmontar, así una ruta no se lleva puesto el head de
 * la siguiente al navegar dentro del SPA.
 */

const BASE = "https://rentfindercleveland.com";

export type SeoOptions = {
  title: string;
  description?: string;
  /** Ruta canónica, con barra inicial. Ante rutas gemelas, siempre la misma. */
  canonicalPath?: string;
  /** true en páginas que no deben indexarse (herramientas, estados, tokens). */
  noindex?: boolean;
  image?: string;
};

/** Etiqueta <meta> por nombre o propiedad; la crea si falta. */
function setMeta(attr: "name" | "property", key: string, value: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  let creado = false;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
    creado = true;
  }
  const prev = el.getAttribute("content");
  el.setAttribute("content", value);
  return () => {
    if (creado) el?.remove();
    else if (prev !== null) el?.setAttribute("content", prev);
  };
}

export function useSeo({ title, description, canonicalPath, noindex, image }: SeoOptions) {
  useEffect(() => {
    const deshacer: Array<() => void> = [];

    const prevTitle = document.title;
    document.title = title;
    deshacer.push(() => { document.title = prevTitle; });

    deshacer.push(setMeta("property", "og:title", title));
    deshacer.push(setMeta("name", "twitter:title", title));

    if (description) {
      deshacer.push(setMeta("name", "description", description));
      deshacer.push(setMeta("property", "og:description", description));
      deshacer.push(setMeta("name", "twitter:description", description));
    }
    if (image) {
      deshacer.push(setMeta("property", "og:image", image));
      deshacer.push(setMeta("name", "twitter:image", image));
    }

    // Un canonical que apunta al home convierte la página en duplicado a ojos
    // de Google. Cuando hay rutas gemelas (/apply y /p/apply, por ejemplo) las
    // dos declaran la MISMA canónica, que es lo que consolida la señal.
    if (canonicalPath) {
      const url = BASE + canonicalPath;
      const link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      const prevHref = link?.getAttribute("href") ?? null;
      if (link) {
        link.setAttribute("href", url);
        deshacer.push(() => { if (prevHref !== null) link.setAttribute("href", prevHref); });
      }
      deshacer.push(setMeta("property", "og:url", url));
    }

    if (noindex) {
      deshacer.push(setMeta("name", "robots", "noindex, follow"));
    }

    return () => { for (const f of deshacer.reverse()) f(); };
  }, [title, description, canonicalPath, noindex, image]);
}

/**
 * Slug de una propiedad, idéntico al de scripts/generate-listing-pages.mjs.
 * Se usa para que /property/:id se canonice hacia su gemela estática, que es
 * la que sí puede indexarse.
 */
export function rentalsPathFor(p: {
  address?: string | null;
  unit_number?: string | null;
  city?: string | null;
  state?: string | null;
}): string | null {
  if (!p.address || !p.city || !p.state) return null;
  const slug = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const unidad = p.unit_number ? ` unit ${p.unit_number.replace(/[()]/g, "")}` : "";
  return `/rentals/${slug(`${p.city} ${p.state}`)}/${slug(p.address + unidad)}/`;
}
