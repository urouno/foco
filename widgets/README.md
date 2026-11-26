# Widgets, registro rápido y avisos de Foco

Foco es una página web instalada desde Safari, así que no puede tener widgets propios ni enviar avisos con la app cerrada. Este directorio resuelve eso con **Scriptable** (gratis en la App Store) y con los avisos del navegador.

## Cómo fluye la información

```
Foco (app web) ◀──al cambiar algo y al salir──▶ Hoja de Google (Tareas + Ajustes)
                                                      ▲
                                                      │ lee el resumen y envía registros rápidos
                          Scriptable (widget) ◀───────┘
                                │
                                ├─▶ dibuja los widgets (cuentas regresivas que avanza iOS)
                                ├─▶ captura tareas o ideas al instante (con cola sin conexión)
                                └─▶ programa avisos locales en el iPhone
```

- **Resumen ya calculado.** Foco guarda en la hoja un resumen con lo que va «Ahora», el reloj de enfoque (con el descanso que sigue ya previsto), la racha, los minutos de enfoque, las áreas y los bloques con hora de hoy y mañana. El widget no adivina: usa la misma lógica que la pantalla Hoy.
- **Bidireccional y sin conexión.** Lo que registras desde el widget de **Captura** (o cuando marcas una tarea como hecha desde un widget) se envía directo a tu hoja de Google. Si no tienes señal, se guarda en una cola local en Scriptable y se sincroniza solo la próxima vez que haya conexión.
- **Correcto entre actualizaciones.** iOS decide cuándo redibuja un widget (normalmente cada 5–15 min). Por eso:
  - la cuenta regresiva la avanza iOS cada segundo, sin redibujar;
  - «ahora» y «sigue» se calculan con la hora real a partir del plan, no con una foto vieja;
  - el script pide redibujar justo cuando termina la actividad en curso o empieza la siguiente.

## Instalación (5 minutos)

1. Instala **Scriptable**.
2. En Foco: **Ajustes › Widgets del iPhone › Copiar el script** (o copia `widgets/Foco.js`).
3. En Scriptable toca **+**, pega el código y llama al script exactamente **Foco**.
4. Ejecútalo una vez: te pide la **URL** y la **clave** de tu hoja (las mismas de Foco › Ajustes) y permiso para avisos.
5. Abre Foco una vez con esta versión, para que envíe el resumen actualizado para los widgets.
6. Agrega los widgets: mantén presionada la pantalla de inicio o la de bloqueo › **+** › Scriptable › elige el tamaño › toca el widget › **Script: Foco**.

## Los widgets

| Dónde | Tamaño | Qué muestra |
|---|---|---|
| Inicio | Pequeño · `ahora` | Actividad en curso (teñida en terracota durante un enfoque activo), cuenta regresiva, barra de avance, hora de término y resumen del día. |
| Inicio | Mediano · `hoy` | Tarjeta «Ahora» + avance «hechas/total» con segmentos + botón rápido **+** + las 3 siguientes (tocables) + racha y bandeja. |
| Inicio | Grande · `agenda` | Línea del día con racha o minutos de enfoque, botón **+**, tarjeta «Ahora», actividades con hora/duración/rutina y vista previa de **Mañana** cuando terminas el día. |
| Bloqueo | Rectangular | Etiqueta (Pomodoro / Ahora · 10:00–10:30), título y cuenta regresiva con la hora de término. |
| Bloqueo | Circular | Anillo de avance con la cuenta regresiva al centro; sin actividad, «hechas / total» del día. |
| Bloqueo | En línea | «Título · hasta 10:25» o «Sigue 11:30 · Título». |

En **Parameter** puedes escribir `ahora`, `hoy`, `agenda`, `pendientes` o `captura` para elegir el diseño sin importar el tamaño (en pequeño, `hoy` y `agenda` muestran `ahora`).

### Nuevo: Widget «Registro rápido» (Parameter: `captura`)
También acepta `rapido`, `registro`, `inbox` o `add`. Pensado para capturar tareas, citas o pensamientos sin abrir Foco.

| Tamaño | Qué muestra |
|---|---|
| Pequeño | Botón **+** grande con contador de Bandeja y avance de Hoy. Tocarlo abre el registro rápido al instante. |
| Mediano | Cuadrícula **2×2** con botones directos: **Bandeja**, **Para hoy**, **Con hora** y **Mente**, más el último elemento capturado. |
| Grande | Los 4 botones directos + tus últimos pendientes en **Bandeja** (o próximas tareas de Hoy) tocables para pasarlos a Hoy o marcarlos como hechos. |
| Bloqueo (circular / rectangular / en línea) | Acceso directo de un toque desde la pantalla de bloqueo para capturar una tarea o idea. |

**Atajos al escribir en el registro rápido:**
- Hora: `15:30` o `9:00` → la agenda a esa hora (para hoy si no indicas día).
- Duración: `30m`, `45min`, `1h`, `1.5h` → asigna la duración del bloque.
- Día: `hoy` o `mañana` → asigna la fecha correspondiente.
- Urgencia: empieza con `!` o agrega `#urgente` → la marca como urgente.
- Ejemplo: `!Llamar al dentista 15:30 30m` → crea «Llamar al dentista» para Hoy a las 15:30 (30 min, urgente).

**Atajos de Apple / Siri / Botón de acción:**
Puedes crear un Atajo que ejecute el script **Foco** en Scriptable pasando un texto (por ejemplo, dictado por voz) en *Texts / Input*: lo guarda automáticamente en tu hoja y devuelve la confirmación.

### Widget «Pendientes» (Parameter: `pendientes`)
Para que nada sin fecha se quede olvidado. Usa la misma regla que la vista **Planifica › Pendientes** de Foco.

| Tamaño | Qué muestra |
|---|---|
| Pequeño | Cuántos pendientes no tienen plan, cuántos están olvidados (más de 14 días sin moverse) y hace cuánto fue tu última revisión. |
| Mediano | Tarjeta resumen + botón **+** + los 3 que más atención piden (tocables para pasar a Hoy o completar). |
| Grande | Reparto por tipo (atrasadas, espera, sin día, bandeja), botón **+** y los 5 primeros tocables con su motivo. |
| Bloqueo rectangular | «Sin plan · 8 · 3 olvidados» y el primero que atender. |
| Bloqueo circular | El número sin plan; el anillo marca qué parte está olvidada. |
| Bloqueo en línea | «8 sin plan · 3 olvidados». |

**Qué cuenta como «sin plan»:** lo que sigue en la Bandeja, próximas acciones sin día, tareas cuyo día ya pasó, y en espera sin fecha de seguimiento o con el seguimiento vencido. Algún día va aparte y solo se señala si lleva 60 días sin revisarse.

**Recordatorio de revisión:** si pasan 7 días sin revisión (o nunca la has hecho), Scriptable te avisa a las 9:30. Se apaga en Scriptable › Foco › Avisos…

### Acciones rápidas al tocar una tarea
En `ahora`, `hoy`, `agenda`, `pendientes` y `captura` (grande), tocar una tarea abre una hoja rápida en Scriptable para:
- **Marcar como hecha** (conservando todas sus notas, área y metadatos);
- **Pasar a Hoy** (cuando viene de Bandeja o Pendientes);
- **Capturar algo rápido**.

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
- **Tocar un aviso o un widget** abre Scriptable (con la acción directa si tocaste `+`, `captura` o una tarea), no Foco: iOS no permite abrir una app web desde otra app.
- Las Live Activities (la cuenta en la isla dinámica) no están disponibles para apps web ni para Scriptable.

## Sin cambios en tu Apps Script

El widget usa la misma petición que Foco (`accion: "sync"` con `ops` para leer o escribir tareas y pensamientos de Mente), y el resumen viaja como una fila más de la hoja **Ajustes** (`clave = widget`). Si la hoja todavía no tiene ese resumen, el widget arma uno aproximado con tus tareas.
