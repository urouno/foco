# Widgets y avisos de Foco

Foco es una página web instalada desde Safari, así que no puede tener widgets propios ni enviar avisos con la app cerrada. Este directorio resuelve eso con **Scriptable** (gratis en la App Store) y con los avisos del navegador.

## Cómo fluye la información

```
Foco (app web) ──al cambiar algo y al salir──▶ Hoja de Google (Ajustes › «widget»)
                                                      │
                          Scriptable (widget) ◀───────┘  lee el resumen, calcula con la hora actual
                                │
                                ├─▶ dibuja el widget (cuentas regresivas que avanza iOS)
                                └─▶ programa avisos locales en el iPhone
```

- **Resumen ya calculado.** Foco guarda en la hoja un resumen con lo que va «Ahora», el reloj de enfoque (con el descanso que sigue ya previsto) y los bloques con hora de hoy y mañana. El widget no adivina: usa la misma lógica que la pantalla Hoy.
- **Se envía al instante.** Cada cambio llega a la hoja en unos 3 segundos, y al salir de Foco (cambiar de app o bloquear el teléfono) se envía de inmediato.
- **Correcto entre actualizaciones.** iOS decide cuándo redibuja un widget (normalmente cada 5–15 min). Por eso:
  - la cuenta regresiva la avanza iOS cada segundo, sin redibujar;
  - «ahora» y «sigue» se calculan con la hora real a partir del plan, no con una foto vieja;
  - el script pide redibujar justo cuando termina la actividad en curso o empieza la siguiente.

## Instalación (5 minutos)

1. Instala **Scriptable**.
2. En Foco: **Ajustes › Widgets del iPhone › Copiar el script** (o copia `widgets/Foco.js`).
3. En Scriptable toca **+**, pega el código y llama al script exactamente **Foco**.
4. Ejecútalo una vez: te pide la **URL** y la **clave** de tu hoja (las mismas de Foco › Ajustes) y permiso para avisos.
5. Abre Foco una vez con esta versión, para que envíe el primer resumen.
6. Agrega los widgets: mantén presionada la pantalla de inicio o la de bloqueo › **+** › Scriptable › elige el tamaño › toca el widget › **Script: Foco**.

## Los widgets

| Dónde | Tamaño | Qué muestra |
|---|---|---|
| Inicio | Pequeño · `ahora` | Actividad en curso, cuenta regresiva, barra de avance y hora de término. Si no hay nada en curso, lo que sigue y en cuánto empieza. |
| Inicio | Mediano · `hoy` | Lo anterior + «1 de 4» del día con segmentos + las 3 siguientes con su hora. |
| Inicio | Grande · `agenda` | Estilo línea de tiempo: tarjeta «Ahora» y las próximas actividades con hora y duración; la que ya empezó muestra lo que le queda. |
| Bloqueo | Rectangular | Etiqueta (Pomodoro / Ahora · 10:00–10:30), título y cuenta regresiva con la hora de término. |
| Bloqueo | Circular | Anillo de avance con la cuenta regresiva al centro; sin actividad, «hechas / total» del día. |
| Bloqueo | En línea | «Título · hasta 10:25» o «Sigue 11:30 · Título». |

En **Parameter** puedes escribir `ahora`, `hoy`, `agenda` o `pendientes` para elegir el diseño sin importar el tamaño (en pequeño, `hoy` y `agenda` muestran `ahora`).

### Widget «Pendientes» (Parameter: `pendientes`)
Para que nada sin fecha se quede olvidado. Usa la misma regla que la vista **Planifica › Pendientes** de Foco.

| Tamaño | Qué muestra |
|---|---|
| Pequeño | Cuántos pendientes no tienen plan, cuántos están olvidados (más de 14 días sin moverse) y hace cuánto fue tu última revisión. |
| Mediano | Lo anterior + los 3 que más atención piden, con el motivo (vence, atrasada, seguimiento, días sin moverse). |
| Grande | Reparto por tipo (atrasadas, en espera, sin día, sin organizar) y los 5 primeros con su motivo. |
| Bloqueo rectangular | «Sin plan · 8 · 3 olvidados» y el primero que atender. |
| Bloqueo circular | El número sin plan; el anillo marca qué parte está olvidada. |
| Bloqueo en línea | «8 sin plan · 3 olvidados». |

**Qué cuenta como «sin plan»:** lo que sigue en la Bandeja, próximas acciones sin día, tareas cuyo día ya pasó, y en espera sin fecha de seguimiento o con el seguimiento vencido. Algún día va aparte y solo se señala si lleva 60 días sin revisarse.

**Recordatorio de revisión:** si pasan 7 días sin revisión (o nunca la has hecho), Scriptable te avisa a las 9:30. Se apaga en Scriptable › Foco › Avisos…

### Qué cuenta como «Ahora» (en este orden)
1. Un enfoque o descanso corriendo en Foco.
2. Una tarea cuya franja horaria incluye este momento (10:00–10:30).
3. Un enfoque en pausa.
4. La primera tarea de Hoy (sin hora).

## Avisos

| Dónde | Quién los genera | Cuándo llegan |
|---|---|---|
| Computadora | La propia app (Ajustes › Avisos) | Mientras Foco esté abierto, aunque sea en otra pestaña o minimizado. Instalarla como app (Chrome/Edge «Instalar», Safari «Agregar al Dock») ayuda. |
| iPhone, Foco cerrado | Scriptable | Siempre: son avisos locales de iOS. Se programan cada vez que el widget se actualiza o abres el script. |
| iPhone, Foco abierto | La app | Solo en iOS 16.4 o posterior y abriendo Foco desde el ícono de la pantalla de inicio. |

Tipos: revisión semanal de pendientes sin plan (solo Scriptable); fin de enfoque y de descanso; inicio de tareas con hora (con 5, 10 o 15 min de antelación); fin del tiempo de cada tarea (estilo temporizador por actividad, apagado por defecto). Se configuran en Foco › Ajustes › Avisos (computadora) y en Scriptable › Foco › Avisos… (iPhone).

### Aviso exacto al terminar un enfoque (iPhone)
Si inicias un pomodoro y bloqueas el teléfono antes de que el widget se actualice, Scriptable todavía no sabe la hora de término. Activa **Ajustes › Widgets del iPhone › Aviso exacto al terminar el enfoque**: al pulsar Empezar, Foco abre Scriptable un instante, programa el aviso sin usar la red y te dice a qué hora llegará. Después vuelve a Foco.

## Límites (para que nada te tome por sorpresa)

- **iOS no deja que una página web «despierte» al widget.** Lo que cambias en Foco aparece en el widget cuando iOS lo redibuja (de 5 a 15 min aproximadamente). La cuenta regresiva y el «ahora / sigue» sí son exactos todo el tiempo.
- **Al llegar a 0, iOS sigue contando hacia arriba** hasta que redibuja el widget. Por eso cada cuenta muestra también la hora de término y el script pide redibujar en ese momento.
- **La barra y el anillo de avance** se dibujan al actualizar; no se mueven segundo a segundo.
- **Pausar o cambiar la hora** en Foco quita el aviso anterior la próxima vez que corre el script. Si el cambio fue hace un momento, abre el script (o el widget) para que se reprogramen ya.
- **Tocar un aviso o un widget** abre Scriptable, no Foco: iOS no permite abrir una app web desde otra app.
- Las Live Activities (la cuenta en la isla dinámica) no están disponibles para apps web ni para Scriptable.

## Sin cambios en tu Apps Script

El widget usa la misma petición que Foco para leer (`accion: "sync"` sin operaciones), y el resumen viaja como una fila más de la hoja **Ajustes** (`clave = widget`). Si la hoja todavía no tiene ese resumen, el widget arma uno aproximado con tus tareas.
