# jcc-portfolio

Portfolio de Jorge Cuadrado Criado. La web es una placa de circuito en 3D: el scroll rutea una pista y cada componente se suelda cuando la pista llega a su pad.

| Componente | Contenido |
| --- | --- |
| J1 · USB-C | perfil (inicio de la pista) |
| Y · cristales | formación |
| R · resistencias | títulos y certificados |
| C · condensadores | experiencia; la altura indica el tiempo en el puesto |
| U · circuitos integrados | proyectos; al pulsarlos se decapan y el die muestra sus tecnologías |
| D · LEDs | conocimientos |
| J2 · bornero | contacto; cada tornillo abre un enlace |
| SW1 · pulsador | vuelve al principio |

Controles: scroll para avanzar, clic para inspeccionar, arrastrar para orbitar, `3` alterna visor 3D y editor de PCB, `F` voltea la placa, `?` muestra los atajos.

## Actualizar el contenido

Todo el contenido está en [`content/portfolio.json`](content/portfolio.json). La placa se construye a partir de él: al añadir un proyecto aparece un chip nuevo, y si no cabe en la fila se abre otra y la placa crece. Las referencias (U1, C1…) se numeran solas.

La forma cómoda de editarlo:

```bash
npm run editor
```

Abre un editor en `http://127.0.0.1:4321` con una pestaña por sección. Desde ahí se puede:

- añadir, quitar y reordenar proyectos, puestos, estudios, títulos y grupos de conocimientos;
- elegir el tamaño del chip de cada proyecto;
- sustituir `public/cv.pdf`;
- **guardar** (escribe el JSON) y **publicar** (commit y push de `content/portfolio.json` y `public/cv.pdf`).

Para ver el resultado mientras se edita, deja `npm run dev` abierto en otra terminal: la web se recarga al guardar.

Si se edita el JSON a mano, `npm run build` lo valida y dice qué campo falla.

## Despliegue

`next.config.ts` usa `output: "export"`; `npm run build` genera la web estática en `out/`.

En Cloudflare Pages, conectado al repositorio de GitHub: comando de build `npm run build`, directorio de salida `out`, y el dominio en *Custom domains*. Con eso, cada **publicar** del editor redespliega la web.

## Estructura

```
content/portfolio.json           contenido
tools/editor/                    editor local (Node, sin dependencias)
src/data/portfolio.ts            tipos y validación del contenido
src/components/board/
  layout.ts        placa en mm: reparto automático de componentes, pista, secciones, scroll
  decor.ts         pistas secundarias, vías, raíles y desacoplos
  paint.ts         texturas de la placa: máscara, rugosidad, relieve, editor 2D
  labels.ts        serigrafía en atlas de alta densidad
  partTextures.ts  grabados, funda de condensadores, floorplan del die
  models.ts        modelos 3D de cada encapsulado
  engine.ts        three.js: cámara, animaciones, selección
  BoardApp.tsx     interfaz: hojas, nota, estado, inspector
src/components/SiteContent.tsx   el mismo contenido en HTML para lectores de pantalla y navegadores sin WebGL
```
