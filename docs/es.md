# Trilium Notes

Conecte Gladys a [Trilium Notes](https://triliumnotes.org) (TriliumNext), la
aplicación autoalojada de toma de notas jerárquica: siga sus contadores y sus
tareas abiertas, reaccione cuando se crea o modifica una nota, cree notas desde
sus escenas y lleve un diario de la casa en la nota del día de Trilium, que
Gladys rellena línea a línea. Todo se queda en su red local: Gladys habla
directamente con su servidor Trilium, a través de su ETAPI.

Probada con un TriliumNext v0.106.1 real (la imagen Docker
`triliumnext/trilium`). Sus comentarios son bienvenidos en el foro de Gladys.

## Requisitos previos

- Gladys Assistant 5.1 o posterior.
- Un servidor Trilium accesible desde la máquina de Gladys: TriliumNext, o el
  Trilium Notes original 0.50 o posterior (la ETAPI). La aplicación de
  escritorio sola no tiene servidor: use su edición servidor o un servidor de
  sincronización.
- Un token ETAPI: en Trilium, abra **Opciones → ETAPI** y haga clic en **Crear
  un nuevo token ETAPI**. Cópielo: solo se muestra una vez.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. En **Dirección de Trilium**, introduzca la dirección en la que abre
   Trilium, por ejemplo `192.168.1.50:8080` o `https://notes.example.org`.
3. Pegue el **Token ETAPI**.
4. **Leer Trilium cada**: 5, 15 (por defecto), 30 o 60 minutos. Las notas
   modificadas se anuncian en la siguiente lectura.
5. **Etiqueta de las tareas**: la etiqueta de sus tareas, `todo` por defecto.
   Una tarea está abierta mientras la nota lleva esta etiqueta y no la etiqueta
   `#done`.
6. **Idioma de nombres y mensajes** fija los nombres de las funciones
   (definidos al añadir el dispositivo) y los textos de la integración. Francés
   por defecto.
7. Guarde y use **Probar la conexión**: muestra la versión de Trilium y el
   número de notas.
8. En la pestaña **Descubrimiento**, añada el dispositivo **Trilium**.

## Dispositivos

**Trilium** (un dispositivo para el servidor):

| Función                | Valor                                            |
| ---------------------- | ------------------------------------------------ |
| Notas                  | número de notas (salvo las archivadas y ocultas) |
| Notas modificadas hoy  | notas creadas o modificadas desde medianoche     |
| Tareas abiertas        | notas con la etiqueta de tareas y sin `#done`    |
| Última nota modificada | título de la última nota creada o modificada     |

Los contadores conservan su historial. El dispositivo conserva su identidad
cuando cambia la dirección del servidor.

## Widget del panel

**Trilium**: tres casillas (notas, modificadas hoy, tareas) y las ocho últimas
notas modificadas, con la hora del cambio. En los ajustes del widget,
**Etiqueta** (por ejemplo `todo` o `compras`) lista en su lugar las notas que
la llevan y no `#done`: una lista de tareas en el panel. **Ocultar los
contadores** deja solo la lista. Cuando se accede a Trilium por https, cada
nota se abre en Trilium.

## Disparadores de escena

- **Nota de Trilium creada o modificada**: se crea o modifica una nota en
  Trilium. Filtro: **Cambio** (creada, modificada o vacío: ambos).
- **Nota de Trilium etiquetada modificada**: lo mismo, para las notas con una
  etiqueta: **Etiqueta** (obligatoria, el nombre de la etiqueta sin `#`,
  exactamente como en Trilium, p. ej. `todo`) y **Cambio**. Cuentan las
  etiquetas heredadas y las de una plantilla. Una nota con varias etiquetas se
  dispara una vez por nombre de etiqueta: una escena configurada con una
  etiqueta se ejecuta una sola vez.

Variables: **Título de la nota**, **Cambio** (`created` o `updated`),
**Dirección de la nota**, **Etiquetas** (las de la propia nota, como
`#nombre=valor`), **Id. de la nota** y **Etiqueta** para el segundo
disparador.

La primera lectura tras la instalación es silenciosa: las notas ya existentes
no se anuncian. Las notas escritas por esta integración nunca se anuncian. Se
anuncian como máximo diez notas por lectura, las más antiguas primero; las
siguientes esperan a la próxima lectura. Más allá de 50 cambios entre dos
lecturas (una importación), se anuncian diez y el resto se cuenta como visto.

## Acciones de escena

- **Añadir una línea a la nota del día de Trilium**: **Línea**, añadida al
  final de la nota de hoy del diario de Trilium, como nuevo párrafo, empezando
  por la hora salvo si **Empezar con la hora** está desactivado. Trilium crea
  la nota del día (y su mes y su año) cuando falta, a partir de su plantilla de
  día si tiene una. La línea se escribe como texto sin formato.
- **Crear una nota de Trilium**: **Título**, y si lo desea **Nota padre** (el
  título exacto o el id. de una nota existente; vacío: la raíz), **Contenido**
  (texto sin formato, un párrafo por línea) y **Etiquetas** (separadas por
  comas, `nombre=valor` para una etiqueta con valor). La etiqueta `todo` la
  convierte en tarea. Una nota padre desconocida es un error: la integración
  nunca crea una.

Ambas devuelven **Id. de la nota**, **Título de la nota** y **Dirección de la
nota**; **Crear una nota de Trilium** devuelve también **Nota padre**.

## Ejemplos de escenas

- **Diario de la casa**: cuando la presión de la caldera baja de 1 bar →
  **Añadir una línea a la nota del día de Trilium**, «Presión de la caldera por
  debajo de 1 bar». Cada día, la nota del día guarda lo que pasó en la casa.
- **Tarea por voz**: una escena de voz → **Crear una nota de Trilium**, padre
  `Compras`, título tomado de la petición, etiquetas `todo`. El contador
  **Tareas abiertas** y el widget la muestran.
- **Saber qué ha cambiado**: disparador **Nota de Trilium etiquetada
  modificada**, etiqueta `familia` → enviar un mensaje
  «{{triggerEvent.data.note_title}} se ha modificado».
- **Recordatorio de tareas**: cada tarde, cuando **Tareas abiertas** supera 5 →
  enviar un mensaje.

## Solución de problemas

- **«Trilium rechazó el token ETAPI»**: el token se eliminó o se copió mal.
  Cree uno nuevo en Opciones → ETAPI.
- **«Trilium no responde»**: compruebe la dirección y el puerto desde la
  máquina de Gladys. El contenedor usa una red en puente: `localhost` es el
  propio contenedor, introduzca en su lugar la dirección IP del servidor.
- **«Esta dirección no responde como Trilium»**: responde la página de inicio
  de sesión de un proxy en lugar de Trilium. Introduzca la dirección del propio
  Trilium.
- **«La nota del día está protegida»**: Trilium no entrega el contenido de una
  nota protegida a la ETAPI. Quite la protección del diario, o escriba en otro
  lugar con **Crear una nota de Trilium**.
- Para ver más en los registros de la integración, defina `LOG_LEVEL=debug`.

## Límites

- Los disparadores se activan en la siguiente lectura (15 minutos por
  defecto), no al instante: Trilium no envía nada por sí mismo. Las notas
  eliminadas o movidas no se anuncian, ni una etiqueta añadida sola (Trilium no
  cambia entonces la hora de modificación de la nota); una nota guardada varias
  veces entre dos lecturas se anuncia una vez.
- Las notas protegidas se cuentan, pero su contenido nunca se lee ni se
  escribe.
- Una lectura son unas pocas búsquedas ETAPI. Los recuentos leen la lista de
  notas como un flujo, sin guardarla: una base de decenas de miles de notas
  cabe en la memoria del contenedor, pero tarda un poco más en contarse.
- La integración nunca elimina ni mueve nada en Trilium.
- Sin relación con Trilium Notes ni TriliumNext.
