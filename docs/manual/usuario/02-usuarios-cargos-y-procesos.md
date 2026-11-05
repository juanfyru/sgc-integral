# Capítulo 2. Usuarios, cargos y procesos

Este capítulo es para el **Administrador del SGC** (Oficina de Calidad): cómo armar la
estructura de la entidad (áreas y cargos), crear las cuentas del personal, asignar
procesos a los líderes y atender los casos del día a día (bloqueos, claves olvidadas,
teléfonos perdidos, sesiones abiertas). Para ingresar y manejar su propia cuenta, vea el
Capítulo 1.

## 1. Entrar al panel de administración

Las páginas de administración están en la barra lateral (Capítulo 3, sección 2): en el
grupo **Documentos**, Gestión de documentos, Listado Maestro, Tipos de documento y Mapa de
procesos; en el grupo **Administración**, Entidad y marca, **Estructura**, **Usuarios**,
Estadísticas, Bitácora, **Accesos** y **Sesiones**. En este capítulo, "Administración →
**Usuarios**" quiere decir: barra lateral, grupo Administración, enlace Usuarios.

Cada persona ve en esa barra solo lo que su rol permite. Si alguien abre una página que
no le corresponde, el SGC le muestra **Sin acceso** ("Su cuenta no tiene permiso para ver
esta sección.").

### Qué puede ver cada rol

Cada cuenta tiene **un solo rol**. Los roles son fijos: no se crean ni se editan.

| Rol | Portal (mapa, procesos, documentos, búsqueda) | Panel de administración |
|---|---|---|
| Administrador del SGC | Sí | Todo |
| Gerencia | Sí | Listado Maestro (documentos vigentes) y Estadísticas |
| Control Interno | Sí | Gestión de documentos (solo lectura, con historial), Listado Maestro con Excel, Estadísticas, Bitácora y Accesos |
| Líder de proceso | Sí, con el bloque **Mis procesos** en la página de inicio | No |
| Consulta | Sí | No |

En el portal todos ven solo las versiones **vigentes** de los documentos. Las versiones
obsoletas y anuladas las ven el Administrador del SGC, Control Interno y las personas a
las que usted les marque **"Puede ver el historial de documentos (versiones obsoletas y
anuladas)"** (sección 3.1). Con esa marca, un líder de proceso o un usuario de consulta
entra al panel solo a **Gestión de documentos**, en solo lectura.

## 2. Estructura: áreas y cargos

Administración → **Estructura**. La página tiene dos partes: **Áreas** y **Cargos**.

Conviene crear la estructura **antes** de crear los usuarios, porque cada usuario se
asocia a un cargo, y del cargo salen su área y su supervisor.

### 2.1 Crear un área

1. Pulse **Nueva área**.
2. Escriba el **Nombre del área** (por ejemplo, "Subgerencia Científica") y pulse
   **Guardar**.

No puede haber dos áreas con el mismo nombre ("Ya existe un área con ese nombre").

- **Cambiar el nombre:** pulse el nombre del área, corríjalo en **Editar área** y pulse
  **Guardar**.
- **Cambiar el orden:** use las flechas ↑ y ↓ a la izquierda de cada área.
- **Desactivar:** pulse **Desactivar**. Un área con cargos activos no se puede desactivar
  ("El área tiene cargos activos; desactívelos primero"). Las áreas inactivas se ven con
  borde punteado y se reactivan con **Activar**.

### 2.2 Crear un cargo

1. En la parte **Cargos**, pulse **Nuevo cargo**.
2. Escriba el **Nombre del cargo**, elija el **Área** y, si el cargo le reporta a otro,
   elija el **Cargo superior (opcional)**. Para el cargo más alto (por ejemplo, Gerente)
   deje "Sin superior".
3. Pulse **Guardar**.

Así se arma el organigrama: cada cargo muestra "Reporta a …" o "Sin superior" y cuántos
usuarios tiene. Reglas:

- En una misma área no puede haber dos cargos con el mismo nombre.
- Un cargo no puede quedar como superior de sí mismo, ni directa ni indirectamente ("El
  cargo superior crea un ciclo en el organigrama").
- Un cargo con usuarios activos no se puede desactivar ("El cargo tiene usuarios activos;
  reasígnelos primero"). Cambie primero el cargo de esas personas.

Áreas y cargos **se desactivan, no se borran**: así no se pierde la historia de quién
ocupaba cada cargo.

### 2.3 Cómo se calcula el supervisor

El supervisor de una persona es, en este orden:

1. Su **jefe inmediato**, si usted lo eligió en la cuenta y esa persona sigue activa
   (sirve para encargos y comités que el organigrama no refleja).
2. Si no, **las personas activas que ocupan el cargo superior** de su cargo.

El supervisor resultante se ve en el detalle del usuario (Supervisores) y en su **Mi
cuenta**. Como el supervisor sale del cargo y no de la persona, cuando alguien se retira
sus subalternos no se quedan sin supervisor: basta con asignar el cargo a quien lo
reemplaza.

## 3. Crear un usuario

Administración → **Usuarios** → **Nuevo usuario**.

### 3.1 Los campos

- **Nombre de usuario:** con el que la persona ingresa. Solo minúsculas, números, punto,
  guion o guion bajo, de 3 a 40 caracteres (por ejemplo `maria.lopez`). **No se puede
  cambiar después.**
- **Nombre completo.**
- **Correo (opcional):** el institucional. No puede repetirse entre usuarios.
- **Rol:** Administrador del SGC, Gerencia, Control Interno, Líder de proceso o
  Consulta. Por defecto, **Consulta**: dé un rol mayor solo cuando haga falta.
- **Cargo (opcional):** de la lista de cargos activos ("Sin cargo" si aún no lo tiene).
- **Jefe inmediato (opcional):** déjelo en "Según el organigrama" salvo que la persona
  le reporte a alguien distinto del cargo superior (sección 2.3).
- **Procesos que lidera:** marque los procesos. Es **obligatorio para el rol Líder de
  proceso** (al menos uno). Para los demás roles es opcional y por ahora solo informativo.
- **Puede ver el historial de documentos (versiones obsoletas y anuladas):** márquela
  solo a quien lo necesite (sección 1).

Pulse **Crear usuario**.

Errores frecuentes: "Ya existe un usuario con ese nombre", "Ya existe un usuario con ese
correo", y el aviso de que el líder de proceso debe tener al menos un proceso asignado.

### 3.2 Entregar la clave temporal

Al crear la cuenta aparece "Usuario … creado." y un recuadro amarillo **Clave temporal de
…** con una clave de la forma `XXXX-XXXX-XXXX-XXXX` y el botón **Copiar**.

- **No se volverá a mostrar.** Ni usted ni nadie puede consultarla después: el SGC no la
  guarda legible.
- Entréguela a la persona **por un medio seguro** (en persona, o por un canal en el que
  solo ella la lea). No la envíe por grupos de chat ni la deje escrita a la vista.
- En su primer ingreso, la persona deberá cambiarla por una propia y aceptar el aviso de
  datos personales (Capítulo 1, sección 3).

Si la clave se perdió antes de entregarla, restablézcala (sección 5.3): se genera otra.

Desde ahí puede ir a **Ver el usuario** o **Volver a la lista**.

## 4. Alta por lote (muchas cuentas a la vez)

Para dar de alta a todo un servicio o a toda la planta: Administración → **Usuarios** →
**Alta por lote**.

1. Pulse **Descargue la plantilla (CSV)**. Es un archivo con la cabecera
   `usuario;nombre;correo;rol;cargo;procesos` y una fila de ejemplo (ana.perez).
2. Ábrala en Excel y llene **una persona por fila** (hasta **500** filas). **Borre o
   reemplace la fila de ejemplo**: si la deja, el SGC creará esa cuenta.
   - **usuario:** con las mismas reglas del formulario (sección 3.1).
   - **nombre:** nombre completo.
   - **correo:** opcional.
   - **rol:** el código o el nombre del rol. La página lista los válidos (por ejemplo
     `lider_proceso` o "Líder de proceso").
   - **cargo:** opcional; el nombre de un cargo activo tal como aparece en la página (no
     importan mayúsculas ni tildes). La página lista cada cargo con su área. Si el mismo
     nombre existe en varias áreas, escriba el área delante, separada con `>`: por ejemplo
     `Urgencias > Auxiliar de Enfermería`.
   - **procesos:** las siglas separadas por `|`, por ejemplo `GTH|CEX`. Obligatorio para
     los líderes de proceso. La página lista las siglas disponibles.
3. Guarde el archivo como **CSV UTF-8**: en Excel, «Guardar como» y elija «CSV UTF-8».
   El archivo no puede pasar de 1 MB.
4. En **Archivo CSV** elija el archivo y pulse **Crear usuarios**. Con muchas filas puede
   tardar unos segundos: no cierre la página mientras dice "Procesando…".

### 4.1 Los resultados

Aparece **Resultados**: cuántas cuentas se crearon y cuántas filas se rechazaron, y una
tabla con la **Línea** del archivo (la cabecera es la línea 1), el **Usuario**, el
**Estado** (Creado o Rechazado) y la **Clave temporal o motivo**.

- Las filas válidas se crean aunque otras fallen.
- **Las claves temporales no se volverán a mostrar.** Pulse **Descargar resultados
  (CSV)** de inmediato y guarde ese archivo en un lugar seguro hasta entregar las claves;
  después bórrelo.
- Corrija las filas rechazadas y súbalas en un archivo nuevo **solo con esas filas** (las
  ya creadas se rechazarían por repetidas).

Motivos de rechazo más comunes:

| Motivo | Qué corregir |
|---|---|
| Rol desconocido «…» | Use un rol de la lista de la página |
| Cargo inexistente «…» | Escriba el cargo como aparece en la lista, o créelo antes en Estructura |
| El cargo «…» existe en varias áreas; escríbalo como Área > Cargo | Escriba el área delante del cargo, como en la lista de la página |
| Proceso inexistente «…» | Use las siglas de la lista, separadas por `\|` |
| Usuario repetido en el archivo (ya aparece en la línea …) | Cada usuario una sola vez en el archivo |
| Ya existe un usuario con ese nombre | Esa cuenta ya existe en el SGC |
| El líder de proceso debe tener al menos un proceso asignado | Llene la columna procesos |
| La fila tiene más columnas que la cabecera | Revise separadores `;` sobrantes en esa fila |

Si el archivo entero se rechaza, el mensaje dice por qué: falta alguna columna de la
cabecera, tiene más de 500 filas, pesa más de 1 MB o no está guardado en UTF-8 («El
archivo debe estar codificado en UTF-8 (en Excel: "CSV UTF-8")»).

El jefe inmediato y la marca de historial no van en la plantilla: póngalos después en el
detalle de cada usuario.

## 5. Administrar un usuario

Administración → **Usuarios**. La lista se puede filtrar con **Buscar** (usuario, nombre
o correo), **Rol** y **Estado** (Activos o Inactivos) y el botón **Filtrar**. Columnas:
Usuario, Rol, Cargo, Estado, 2FA (segundo factor) y Último ingreso. En Estado se ve
**Activo**, **Inactivo** o **Bloqueado hasta** la hora en que vence el bloqueo; "Clave
temporal" indica que la persona aún no ha cambiado su clave inicial.

Pulse el nombre de una persona para abrir su detalle. Allí están el **Estado de la
cuenta** (creación, segundo factor, cambio de clave pendiente, fecha en que aceptó el
aviso de datos, sesiones activas, cargo y supervisores), las **Acciones** y el formulario
**Datos y permisos**.

Las acciones delicadas piden confirmación: al pulsar su nombre (por ejemplo
"Desactivar usuario…") se despliega una explicación y el botón que la ejecuta.

### 5.1 Editar datos, rol y procesos

En **Datos y permisos** cambie lo necesario y pulse **Guardar cambios**. Todo cambio de
rol, cargo, procesos o permisos queda en la **Bitácora** ("Editó el usuario «…»"); el
registro guarda el valor anterior y el nuevo de cada campo que cambió.

**Asignar procesos a un líder:** ponga el rol **Líder de proceso**, marque sus procesos en
**Procesos que lidera** y guarde. La próxima vez que esa persona abra el portal verá el
bloque **Mis procesos** con accesos directos a sus procesos. Si un proceso se desactiva en
el mapa, deja de aparecerle.

### 5.2 Desactivar o reactivar

**Desactivar usuario…** → **Desactivar usuario**: la persona no podrá ingresar y se
cierran sus sesiones abiertas. **Su historial se conserva**: las cuentas no se borran
nunca, porque lo que hicieron debe seguir en la bitácora. Úselo cuando alguien se retira
o cambia de entidad. **Reactivar usuario** la habilita de nuevo.

Nadie puede desactivarse a sí mismo ("No puede desactivar su propia cuenta.").

### 5.3 Restablecer la clave (clave olvidada)

**Restablecer clave…** → **Restablecer clave**. El SGC genera una **clave temporal
nueva**, la muestra **una sola vez** (como en la sección 3.2), cierra todas las sesiones
de la persona y levanta cualquier bloqueo. En su próximo ingreso deberá elegir una clave
propia. El segundo factor, si lo tenía, se mantiene.

Antes de restablecer, confirme que quien lo pide es de verdad el titular de la cuenta.

### 5.4 Desbloquear

Cuando una cuenta está bloqueada por intentos fallidos, en Acciones aparece
**Desbloquear**. Púlselo para que la persona pueda ingresar de inmediato. Si ella dice que
no fue quien se equivocó, revise **Accesos** (sección 6) antes de desbloquear: puede ser
alguien intentando adivinar la clave.

### 5.5 Quitar el segundo factor (teléfono perdido)

Si la persona perdió el teléfono y no tiene sus códigos de recuperación: **Quitar segundo
factor…** → **Quitar segundo factor**. Se cierran todas sus sesiones abiertas (por si el
teléfono se perdió con una sesión iniciada). Desde ese momento ingresa solo con su clave
hasta que vuelva a activarlo en Mi cuenta (si su rol lo exige, el SGC se lo pedirá al
ingresar). Confirme antes la identidad de quien lo pide.

### 5.6 Su propia cuenta

En su propio detalle el panel no ofrece desactivarse, restablecer su clave ni quitar su
segundo factor ("Para cambiar su clave o su segundo factor use Mi cuenta."). Use **Mi
cuenta** (Capítulo 1, secciones 5 y 6), que le pide su clave actual. Tampoco puede
quitarse a sí mismo el rol de Administrador del SGC.

## 6. Accesos: quién entró y cuándo

Administración → **Accesos**. Es el registro de cada intento de ingreso y salida. Lo ven
el Administrador del SGC y Control Interno (en solo lectura); nadie puede modificarlo ni
borrarlo.

- **Filtros:** **Usuario** (lo que se tecleó al ingresar o el nombre de la persona),
  **Resultado**, **Desde** y **Hasta**. Pulse **Filtrar**; **Limpiar** quita los filtros.
- **Columnas:** Cuándo, Usuario (lo que se escribió, y debajo el nombre si la cuenta
  existe), Resultado, IP y Navegador. Se muestran 50 registros por página, con
  **Anterior** y **Siguiente**.
- **Resultados posibles:** Ingreso, Salida, Fallo, Bloqueo, Desbloqueo, Restablecimiento,
  Fallo del segundo factor y Cierre forzado.

Cómo leerlo:

- Varios **Fallo** seguidos y un **Bloqueo** de la misma persona: se equivocó de clave
  cinco veces, o alguien intentó adivinarla. Pregúntele antes de desbloquear.
- **Fallo** con un usuario que no existe: alguien probó un nombre de usuario equivocado
  o inventado.
- Muchos fallos de distintas cuentas en poco tiempo: avise al área de sistemas.
- La columna **IP** aparece con "—" mientras la instalación no tenga configurado el
  proxy de entrada; el resto del registro es igual de válido.

## 7. Sesiones activas

Administración → **Sesiones**. Muestra quién tiene el SGC abierto en este momento:
Usuario, Rol, IP, Navegador, Iniciada, Último uso y Acción. La marca « · segundo factor
pendiente», junto al nombre de usuario, indica que la persona escribió su clave pero aún
no el código.

- **Cerrar** cierra esa sesión: la próxima vez que la persona haga clic, el SGC la lleva a
  la pantalla de ingreso. Queda en Accesos como **Cierre forzado** y en la Bitácora.
- Úselo, por ejemplo, si alguien dejó el SGC abierto en un equipo compartido o si se
  sospecha que otra persona usa su cuenta (en ese caso, además, restablezca la clave).
- Su propia sesión aparece como "Esta sesión" y no se puede cerrar desde aquí: use
  **Salir**.

Las sesiones se cierran solas tras 60 minutos sin uso (valor por defecto).

## 8. Bitácora de las acciones sobre usuarios

Administración → **Bitácora** registra, en frases legibles, cada acción de administración
de cuentas con quién la hizo y cuándo, por ejemplo: "Creó el usuario «…»", "Editó el
usuario «…»", "Desactivó el usuario «…»", "Restableció la clave de «…»", "Desbloqueó al
usuario «…»", "Cerró la sesión de «…»" y "Creó N usuarios por lote (M rechazados)".
También quedan las acciones de cada persona sobre su cuenta: cambiar su clave, aceptar el
aviso de datos y activar o desactivar el segundo factor. La bitácora no se puede editar
ni borrar.

## 9. Mantenga al menos dos administradores

Mientras haya un solo Administrador del SGC activo, la página **Usuarios** muestra el
aviso:

> Hay un solo administrador del SGC activo. Cree un segundo para no depender de una sola
> persona.

El aviso no bloquea nada, pero tómelo en serio: si el único administrador está de
vacaciones, se retira o pierde el acceso, nadie puede crear cuentas, restablecer claves ni
desbloquear. Cree una segunda cuenta con el rol **Administrador del SGC** para otra
persona de confianza (no una segunda cuenta para usted mismo).

Lo que sí se impide es quedarse sin ninguno: si un cambio de rol o una desactivación
dejaría la instalación sin Administradores del SGC activos, el SGC lo rechaza con "Debe
quedar al menos un Administrador del SGC activo.".

Si aun así la entidad se queda sin ningún administrador que pueda ingresar, el área de
sistemas puede recuperar la cuenta del primer administrador con el procedimiento de
rescate de la instalación (manual técnico). El rescate le asigna la clave inicial que el
área de sistemas define en la configuración de la instalación, que deberá cambiar al
ingresar, y la deja lista para usar: con el rol Administrador del SGC, activa, desbloqueada, sin
segundo factor (se activa de nuevo en Mi cuenta) y sin sesiones abiertas. Queda registrado
en **Accesos** como restablecimiento.

## 10. Aviso de datos personales

El texto que cada persona acepta en su primer ingreso se edita en Administración →
**Entidad y marca**, campo **Aviso de datos personales** (Capítulo 4, sección 2). Es
obligatorio: el SGC no deja guardarlo vacío. Si cambia el texto, a quienes ya lo
aceptaron no se les vuelve a pedir. La fecha de aceptación de cada persona se ve en su detalle (Aviso
de datos aceptado).
