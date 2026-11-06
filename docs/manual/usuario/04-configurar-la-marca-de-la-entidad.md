# Capítulo 4. Configurar la marca de la entidad

Este capítulo es para el **Administrador del SGC** (Oficina de Calidad): cómo poner el
nombre, la sigla, el lema, los colores y el logo de la entidad, qué revisa el SGC antes
de aceptar un color, dónde se ve cada cosa y dónde quedaron los textos del mapa de
procesos. Lo que configure aquí lo ven todas las personas que usan el SGC, también en la
pantalla de ingreso.

## 1. Abrir la pantalla

Barra lateral → grupo **Administración** → **Entidad y marca**. La página dice "Nombre,
logo y colores que ven todas las personas." y tiene dos partes:

- A la izquierda, el formulario con los datos y los colores, que se guarda con el botón
  **Guardar** (secciones 2 y 3).
- A la derecha, la **Vista previa** de los colores (sección 3.3) y la sección **Logo**,
  que se guarda aparte (sección 4).

Solo el Administrador del SGC ve esta pantalla. Cualquier otro rol que abra la dirección
recibe **Sin acceso**.

## 2. Nombre, sigla, lema y aviso de datos

| Campo | Qué escribir | Reglas |
|---|---|---|
| **Nombre de la entidad** | El nombre completo, como debe leerse en la barra lateral y en el ingreso | Entre 3 y 120 caracteres |
| **Sigla** | La sigla corta ("Aparece en el monograma de la barra lateral y en la pestaña.") | Entre 2 y 12 caracteres |
| **Lema** | El lema institucional, si lo hay | Hasta 200 caracteres; puede quedar vacío |
| **Aviso de datos personales** | El aviso de tratamiento de datos ("Texto que cada persona acepta en su primer ingreso.") | Obligatorio, hasta 5000 caracteres |

El aviso de datos personales no puede quedar vacío: es el texto que cada persona acepta
al ingresar por primera vez (Capítulo 1, sección 3.2), y la entidad debe informarlo según
la Ley 1581 de 2012. Pida el texto vigente a quien maneje la protección de datos en la
entidad. Si cambia el texto, a quienes ya lo aceptaron no se les vuelve a pedir.

Cuando termine, pulse **Guardar**. Si todo está bien aparece **Cambios guardados**, y cada
persona ve los cambios en la siguiente página que abra.

## 3. Los colores

La entidad tiene dos colores, que se eligen en **Color primario** y **Color secundario**.
Cada uno tiene un cuadro de color, que abre el selector del sistema, y una casilla de
texto con el código del color en la forma `#` más seis dígitos o letras de la a a la f
(por ejemplo, `#1b4e8e`). Puede usar cualquiera de los dos; si tiene el código del
manual de imagen de la entidad, escríbalo en la casilla.

- El **color primario** es el de los botones principales (siempre con letra blanca), la
  página resaltada en la barra lateral, los enlaces, la línea bajo la barra superior y el
  borde que marca dónde está el cursor.
- El **color secundario** es el del cuadro con la sigla (cuando no hay logo) y de algunos
  detalles e íconos.

Solo se configuran los colores del tema claro. El SGC calcula solo la versión para el tema
oscuro, que la vista previa muestra al lado.

### 3.1 Qué significa el contraste

El contraste mide cuánto se distingue un color de otro, con una cifra que va de **1:1**
(dos colores iguales) a **21:1** (negro sobre blanco). El SGC sigue la norma internacional
de accesibilidad web (WCAG 2.1, nivel AA), que pide:

- **4,5:1 como mínimo para un texto.** Como los botones principales llevan letra blanca
  sobre el color primario, el SGC exige que el **primario** tenga al menos 4,5:1 con el
  blanco.
- **3:1 como mínimo para un elemento que hay que ver**, como un ícono o un recuadro. El
  SGC exige que el **secundario** tenga al menos 3:1 con el fondo de las páginas. La letra
  que va encima del secundario (en el cuadro de la sigla) la elige el SGC, blanca u
  oscura, según cuál se lea mejor.

Así, cualquier persona, también quien ve poco o trabaja con una pantalla con poco brillo,
puede leer los botones y distinguir los detalles, y nadie tiene que probar colores a ojo.

### 3.2 Si un color no cumple

Mientras escribe, si un color no cumple aparece debajo de él un mensaje en rojo, y la
vista previa marca **no cumple**. Al pulsar **Guardar**, el servidor vuelve a revisar los
dos colores y, si uno no cumple, **no guarda nada** y muestra el motivo con la cifra
medida y una sugerencia.

Ejemplo con el primario: si escribe el azul claro `#9ecbff`, el SGC responde

> El color primario #9ecbff no tiene contraste suficiente con el texto blanco (1,7:1;
> mínimo 4,5:1). Pruebe #4a74a3.

La letra blanca sobre `#9ecbff` mide **1,7:1**, muy lejos del mínimo de **4,5:1**: los
botones serían casi ilegibles. La sugerencia `#4a74a3` es el mismo tono de azul, más
oscuro, y mide **4,9:1**: cumple. Copie la sugerencia en la casilla del color primario y
pulse **Guardar** otra vez.

Ejemplo con el secundario: si escribe el amarillo `#fcd116`, el SGC responde

> El color secundario #fcd116 no se distingue del fondo (1,4:1; mínimo 3:1). Pruebe
> #a48700.

La sugerencia es siempre el color más parecido al suyo que sí cumple: el mismo tono, más
oscuro. Si no le gusta, pruebe otro color de su manual de imagen.

Si el código no está completo o tiene letras que no corresponden, el mensaje es "Use un
color de seis dígitos, por ejemplo #1b4e8e."

Lo que escribió en los demás campos se conserva en el formulario: corrija el color y
vuelva a pulsar **Guardar**.

### 3.3 La vista previa

La **Vista previa** muestra, mientras escribe y antes de guardar, cómo quedan los colores
en dos pantallas pequeñas: **Tema claro** y **Tema oscuro**, cada una con un pedazo de la
barra lateral (el cuadro con la sigla, el nombre y el enlace **Inicio**) y un botón
**Guardar** de muestra.

Debajo aparecen tres líneas con la cifra medida y si **cumple** o **no cumple**. Con el
primario `#1b4e8e` y el secundario `#2e9b47`, por ejemplo, dicen:

- "Primario, texto blanco: 8,3:1 · cumple"
- "Secundario, fondo claro: 3,3:1 · cumple"
- "Monograma: texto tinta, 5,0:1 · cumple" (la letra del cuadro con la sigla: "blanco" o
  "tinta", que es el gris casi negro del texto)

La vista previa usa el mismo cálculo que el servidor, pero **la revisión que vale es la
del servidor** al pulsar **Guardar**.

## 4. El logo

El logo es opcional. Sin logo, el SGC muestra un cuadro con la sigla sobre el color
secundario.

### 4.1 Preparar el archivo

- **Formato:** PNG, JPG o WebP. **No se aceptan archivos SVG** (el formato vectorial),
  porque pueden llevar instrucciones ocultas que el navegador ejecutaría. Si el logo está
  en SVG, PDF u otro formato de diseño, pida que lo exporten a PNG.
- **Peso:** hasta **1 MB**.
- **Medidas:** entre **64 y 2048 píxeles** por lado.
- **Recomendado:** una imagen **cuadrada** de unos 512 × 512 píxeles en **PNG con fondo
  transparente**. El logo se muestra pequeño y dentro de un cuadro (en la barra lateral y
  en la pantalla de ingreso): uno muy ancho se verá diminuto, y uno con fondo blanco se
  verá como un recuadro blanco en el tema oscuro.

El SGC no recorta ni cambia el tamaño de la imagen: prepárela como quiere que se vea.

### 4.2 Subir, cambiar o quitar el logo

La sección **Logo** muestra el logo actual o el aviso "Sin logo: se muestra el monograma
con la sigla."

1. En **Subir logo**, pulse el botón para elegir el archivo ("PNG, JPG o WebP, hasta 1 MB
   y entre 64 y 2048 píxeles por lado.").
2. Elija el archivo. Se sube en ese momento, sin pulsar **Guardar**.
3. Aparece **Logo actualizado** y el logo nuevo se ve en la sección y en la barra
   lateral.

Para cambiarlo, suba otro: reemplaza al anterior. Para volver al cuadro con la sigla,
pulse **Quitar logo**: aparece **Logo quitado**.

### 4.3 Si el logo se rechaza

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| El logo debe ser PNG, JPG o WebP | El archivo no es una imagen de esos tipos, aunque su nombre termine en `.png`: el SGC revisa el contenido del archivo, no el nombre. Pasa, por ejemplo, con un SVG al que le cambiaron la extensión | Exporte el logo a PNG desde el programa de diseño |
| El logo supera 1 MB (antes aparece el aviso "El archivo pesa 3,0 MB; el máximo es 1 MB.", con el peso de su archivo) | El archivo pesa más de 1 MB | Reduzca las medidas o guárdelo con más compresión |
| El logo debe medir entre 64 y 2048 píxeles por lado (recibido 32 × 32) | La imagen es muy pequeña o muy grande (la cifra es la de su archivo) | Expórtela a unos 512 × 512 píxeles |
| No se pudo leer el tamaño de la imagen | El archivo está dañado o incompleto | Vuelva a exportarlo |
| Demasiadas subidas seguidas. Espere un minuto. | Se hicieron muchas subidas en poco tiempo | Espere un minuto |
| Su sesión terminó; vuelva a ingresar | La sesión se cerró (por ejemplo, por inactividad) | Ingrese de nuevo y repita la subida |
| No se pudo conectar con el servidor | Se perdió la conexión | Revise la red y repita la subida |

## 5. Dónde se ve cada cosa

| Dato | Dónde se ve |
|---|---|
| Nombre de la entidad | Arriba en la barra lateral; en la pantalla de ingreso y en las de la cuenta (Mi cuenta, clave inicial, aviso de datos); encima del título de **Inicio** y del **Listado Maestro**; en el encabezado del Excel del Listado Maestro; en la pestaña del navegador de las páginas sin título propio, como **Inicio** ("<nombre> · SGC"); y en la aplicación de autenticación de quien active el segundo factor después del cambio |
| Sigla | Debajo del nombre en la barra lateral; dentro del cuadro de la sigla cuando no hay logo; al final del título de la pestaña en las páginas con título propio (por ejemplo, "Ingreso · HNSF") |
| Lema | En la franja al pie del mapa de procesos de **Inicio** |
| Logo | En la barra lateral, en la pantalla de ingreso y en las de la cuenta. El ícono pequeño de la pestaña del navegador sigue siendo el de la plataforma |
| Color primario | Botones principales, página resaltada en la barra lateral, enlaces, línea bajo la barra superior y borde de foco |
| Color secundario | Cuadro de la sigla y algunos detalles e íconos |
| Aviso de datos personales | En la pantalla **Aviso de datos personales** del primer ingreso |

Los colores de las bandas del mapa de procesos **no** son los de la marca: son datos del
mapa y se cambian en el editor del mapa, en el campo **Color** de cada macroproceso.

Los cambios de datos y colores, y cada logo que se sube o se quita, quedan en la
**Bitácora** con su nombre y la fecha: "Editó la entidad y la marca: nombre, sigla, lema,
aviso de datos personales, color primario, color secundario" (cada **Guardar** registra
los seis datos de la pantalla, aunque solo haya cambiado uno), "Cambió el logo de la
entidad («…», … × …)" y "Quitó el logo de la entidad".

## 6. Textos del mapa y código de documentos

Los demás textos del mapa siguen en el editor del mapa: barra lateral → grupo
**Documentos** → **Mapa de procesos** → botón **Textos**. La página **Textos del mapa y
código de documentos** recuerda que "Nombre, lema y aviso de datos personales se editan
en Administración → Entidad y marca." y tiene estos campos:

- **Subtítulo del mapa**: la frase que aparece debajo del título de **Inicio**.
- **Título del ciclo PHVA** y **Texto del ciclo PHVA**: el recuadro del ciclo Planear,
  Hacer, Verificar, Actuar que acompaña al mapa.

El formato del código de los documentos (por defecto `{PROCESO}-{TIPO}-{NN}`, por ejemplo
`SGC-FO-02`) ya no se edita en esta página: se edita en **Configuración documental**
(Capítulo 5, sección 14.1).

Pulse **Guardar** para aplicar los cambios. En la **Bitácora** queda "Editó los textos del
mapa y el código de documentos: subtítulo del mapa, título del ciclo PHVA, …".

## 7. Resumen de mensajes

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| Cambios guardados | Los datos y los colores quedaron guardados | Nada |
| El color primario … no tiene contraste suficiente con el texto blanco (…:1; mínimo 4,5:1). Pruebe …. | La letra blanca no se leería sobre ese primario | Use la sugerencia u otro color más oscuro (sección 3.2) |
| El color secundario … no se distingue del fondo (…:1; mínimo 3:1). Pruebe …. | El secundario casi no se ve sobre el fondo de las páginas | Use la sugerencia u otro color más oscuro (sección 3.2) |
| Use un color de seis dígitos, por ejemplo #1b4e8e. | El código del color está incompleto o mal escrito | Escriba `#` y seis dígitos o letras de la a a la f |
| Logo actualizado / Logo quitado | El logo se cambió o se quitó | Nada |
| El logo debe ser PNG, JPG o WebP | El archivo no es una imagen aceptada | Exporte el logo a PNG (sección 4.3) |
| El logo supera 1 MB | El archivo pesa más de 1 MB | Redúzcalo (sección 4.3) |
