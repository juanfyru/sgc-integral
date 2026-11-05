# Capítulo 1. Ingreso, clave y segundo factor

Este capítulo es para todas las personas que usan el Sistema de Gestión de Calidad (SGC):
cómo entrar, qué hacer la primera vez, cómo cambiar la clave, cómo proteger la cuenta con
un segundo factor y qué hacer si algo falla.

Cada funcionario tiene su **cuenta personal**. No preste su usuario ni use la cuenta de
otra persona: todo lo que se hace en el SGC queda registrado a nombre de quien ingresó.

## 1. Ingresar

1. Abra en el navegador la dirección del SGC que le indicó la Oficina de Calidad o el área
   de sistemas.
2. Aparece la pantalla **Ingreso al SGC**. Escriba su **Usuario** y su **Clave**.
3. Pulse **Ingresar**.

Si escribió bien sus datos, entra a **Inicio**: sus tareas y el mapa de procesos de la
entidad (Capítulo 3). Si había
abierto un enlace a una página concreta (por ejemplo, un documento), al ingresar el SGC lo
lleva a esa página.

Todo el SGC exige ingresar: no hay páginas abiertas sin cuenta.

### Si el ingreso falla

Si el usuario no existe, la clave no es correcta, la cuenta está desactivada o está
bloqueada, el SGC muestra siempre el mismo mensaje:

> Usuario o clave incorrectos. Si falló varias veces, la cuenta se bloquea temporalmente;
> espere o pida al administrador que la desbloquee.

El mensaje es igual en todos los casos a propósito: así nadie puede averiguar, probando,
si un usuario existe o si una cuenta está bloqueada.

Si desde el mismo equipo o red se hacen muchos intentos seguidos, puede aparecer
**"Demasiados intentos desde esta red. Espere un minuto."** Espere un minuto y vuelva a
intentar.

## 2. Bloqueo de la cuenta

Para proteger su cuenta de quien intente adivinar la clave:

- Al **quinto intento fallido seguido**, la cuenta se bloquea **15 minutos**.
- Si después de ese bloqueo vuelve a fallar cinco veces, el bloqueo siguiente dura el
  doble (30 minutos, luego 60, 120…), hasta un máximo de **24 horas**.
- Los códigos equivocados del segundo factor (sección 6) también cuentan como intentos
  fallidos.
- Un ingreso completo y correcto pone los contadores en cero.

Mientras la cuenta está bloqueada, **ni siquiera la clave correcta deja entrar**, y la
pantalla sigue mostrando el mensaje general de la sección 1: el SGC no le dice cuánto
falta. Los intentos que haga durante el bloqueo no lo alargan, pero tampoco sirven.
Tiene dos opciones:

- **Esperar** a que pase el tiempo del bloqueo y volver a intentar con calma.
- **Pedir al administrador del SGC que la desbloquee.** El administrador ve hasta qué hora
  dura el bloqueo y puede levantarlo de inmediato.

Si no reconoce los intentos fallidos (usted no se equivocó de clave), avísele al
administrador: alguien pudo intentar entrar con su usuario.

## 3. El primer ingreso

Cuando el administrador crea su cuenta, le entrega un **usuario** y una **clave temporal**
de la forma `XXXX-XXXX-XXXX-XXXX` (solo letras mayúsculas y números, sin letras ni números
que se confundan como la O y el 0). Esa clave sirve solo para el primer ingreso.

### 3.1 Cambiar la clave inicial

Al ingresar con la clave temporal, el SGC lo lleva a **Cambie su clave inicial** ("Su
clave actual es temporal. Elija una propia para continuar."). No puede ver nada más hasta
completar este paso.

1. Escriba su clave nueva en **Clave nueva**.
2. Escríbala otra vez en **Confirme la clave nueva**.
3. Pulse **Cambiar clave**.

La clave nueva debe cumplir tres reglas, que la pantalla recuerda:

- Tener **entre 12 y 128 caracteres**.
- **No ser una clave común** (el SGC trae una lista de claves muy usadas y las rechaza).
- **No contener su nombre de usuario.**

Además, **no puede ser la misma clave temporal**: esa clave también la conoce quien se la
entregó.

Si no las cumple, el SGC le dice el motivo: por ejemplo "La clave debe tener al menos 12
caracteres.", "Esa clave es demasiado común; elija otra.", "La clave no puede contener el
nombre de usuario." o "La clave nueva debe ser distinta de la clave temporal.". Si las dos
casillas no coinciden, aparece un aviso de que la confirmación no coincide con la clave
nueva.

**Consejo:** una frase de varias palabras que solo usted conozca es fácil de recordar y
difícil de adivinar (por ejemplo, cuatro palabras sin relación entre sí). La clave no
caduca: no tendrá que cambiarla cada cierto tiempo, salvo que sospeche que alguien la
conoce.

### 3.2 Aceptar el aviso de datos personales

Después de cambiar la clave aparece el **Aviso de datos personales** de la entidad.
Léalo, marque la casilla **"He leído el aviso y autorizo el tratamiento de mis datos de
cuenta."** y pulse **Aceptar y continuar**. Se pide una sola vez; su aceptación queda
registrada con la fecha.

### 3.3 Segundo factor obligatorio (solo algunos roles)

Si la entidad decidió que su rol debe usar segundo factor, después del aviso aparece la
pantalla **Segundo factor** con el mensaje "Su rol exige segundo factor. Actívelo para
continuar." Siga los pasos de la sección 6. Si en ese momento no tiene el teléfono a
mano, pulse **Salir** y vuelva cuando lo tenga: no podrá usar el SGC hasta activarlo.

## 4. Mi cuenta

En la parte superior derecha de cualquier página hay un botón con su nombre. Al pulsarlo
se abre un menú con:

- **Mi cuenta**.
- **Tema** (claro, oscuro o según el sistema; Capítulo 3, sección 6.1).
- **Salir**.

Las páginas de administración, si su rol las tiene, están en la barra lateral (Capítulo 3,
sección 2).

En **Mi cuenta** ve **Mis datos** (nombre, usuario, correo, rol, cargo, área, los procesos
que tiene asignados y sus supervisores) y las secciones **Cambiar clave** y **Segundo
factor**. Si algún dato está mal (por ejemplo, el cargo o los procesos), pídale al
administrador del SGC que lo corrija: usted no puede cambiarlos.

## 5. Cambiar la clave

Hágalo cuando quiera, y siempre que sospeche que alguien la conoce.

1. Menú con su nombre → **Mi cuenta** → sección **Cambiar clave**.
2. Escriba su **Clave actual**, la **Clave nueva** y repítala en **Confirme la clave
   nueva**.
3. Pulse **Cambiar clave**.

Aparece el mensaje **"Su clave se cambió. Las demás sesiones abiertas se cerraron."**: si
tenía el SGC abierto en otro equipo, allí tendrá que ingresar de nuevo con la clave nueva.

La clave nueva sigue las mismas reglas de la sección 3.1 y además debe ser distinta de la
actual. Si se equivoca en la clave actual aparece "La clave actual no es correcta". Si
falla muchas veces seguidas, el SGC pide esperar unos minutos ("Demasiados intentos.
Espere unos minutos.").

## 6. Segundo factor (verificación en dos pasos)

El segundo factor protege su cuenta aunque alguien llegue a conocer su clave: además de
la clave, el SGC le pedirá un código de 6 dígitos que cambia cada 30 segundos y que solo
muestra su teléfono. Funciona sin internet y sin correo.

Necesita una **aplicación de autenticación** instalada en su teléfono, por ejemplo Google
Authenticator, Microsoft Authenticator o Aegis.

### 6.1 Activarlo

1. Menú con su nombre → **Mi cuenta** → sección **Segundo factor** → **Activar segundo
   factor**.
2. En la pantalla **Segundo factor**, pulse **Activar segundo factor**.
3. Abra la aplicación de autenticación en el teléfono, elija agregar una cuenta y
   **escanee el código QR** que aparece en pantalla. Si no puede escanearlo, use la clave
   que aparece debajo ("¿No puede escanear? Escriba esta clave en la aplicación:") y
   escríbala en la aplicación.
4. La aplicación empieza a mostrar un código de 6 dígitos. Escríbalo en **Código de 6
   dígitos de la aplicación**.
5. Escriba su clave del SGC en **Clave actual**. Se pide para confirmar que es usted
   quien activa el segundo factor.
6. Pulse **Confirmar y activar**.

Si el código ya cambió o lo escribió mal, aparece "Código incorrecto": espere el código
siguiente y vuelva a intentar. Si la clave no es correcta, aparece "Clave incorrecta".

### 6.2 Guardar los códigos de recuperación

Al activar el segundo factor aparece **Segundo factor activado** con **8 códigos de
recuperación** de la forma `XXXXX-XXXXX`.

- **Se muestran una sola vez.** Guárdelos ya: pulse **Copiar** y péguelos en un lugar
  seguro, o anótelos en papel y guárdelo donde no lo vea nadie más.
- Cada código sirve **una sola vez**, para entrar si pierde o cambia el teléfono.
- Cuando los haya guardado, pulse **Ya los guardé, continuar**.

### 6.3 Ingresar con el segundo factor

Desde ese momento, al ingresar:

1. Escriba su usuario y su clave como siempre y pulse **Ingresar**.
2. Aparece **Verificación en dos pasos**. Abra la aplicación del teléfono, escriba el
   código que muestra en **Código de 6 dígitos** y pulse **Verificar**.

Si no tiene el teléfono, pulse **Usar un código de recuperación**, escriba uno de sus
códigos (con o sin el guion) y pulse **Verificar**. Ese código queda gastado. Para volver
al código de la aplicación, pulse **Usar el código de la aplicación**. Si quiere salir
sin terminar, pulse **Cancelar y salir**.

Cada código equivocado cuenta como intento fallido (sección 2). Si se llega al bloqueo,
el SGC cierra el intento y vuelve a la pantalla de ingreso con el mensaje **"Se agotaron
los intentos del segundo factor. Ingrese de nuevo."**

### 6.4 Desactivarlo

1. Menú con su nombre → **Mi cuenta** → **Administrar segundo factor**.
2. Escriba su clave en **Su clave, para confirmar** y pulse **Desactivar segundo
   factor**.

Si su rol exige segundo factor, la pantalla dice "Su rol exige segundo factor; no puede
desactivarlo." y no ofrece el botón.

Si gastó varios códigos de recuperación y su rol lo permite, puede desactivar el segundo
factor y volver a activarlo: recibe 8 códigos nuevos y los anteriores dejan de servir.

### 6.5 Si perdió o cambió el teléfono

- Ingrese con un **código de recuperación** (sección 6.3) y, ya dentro, desactive y vuelva
  a activar el segundo factor con el teléfono nuevo. Si su rol no le permite desactivarlo,
  pídale al administrador que se lo quite y actívelo de nuevo.
- Si tampoco tiene los códigos de recuperación, pídale al **administrador del SGC que le
  quite el segundo factor**. Después podrá ingresar solo con su clave y deberá activarlo
  de nuevo (de inmediato, si su rol lo exige).

## 7. Cerrar sesión

Menú con su nombre (arriba a la derecha, en cualquier página) → **Salir**.

**Salga siempre al terminar si el equipo es compartido** (puestos de enfermería,
consultorios, salas de reunión). Si se aleja del equipo sin salir, cualquiera puede usar
el SGC a su nombre.

Por seguridad, la sesión **se cierra sola tras 60 minutos sin uso** (la entidad puede
ajustar ese tiempo). También se cierra si cambia su clave en otro equipo, si el
administrador la cierra o si su cuenta se desactiva. En esos casos, el siguiente clic lo
lleva a la pantalla de ingreso: vuelva a ingresar y continúe.

## 8. Si olvidó la clave

Por ahora el SGC no tiene la opción "olvidé mi clave" por correo. Haga esto:

1. Pida al **administrador del SGC** (Oficina de Calidad) que **restablezca su clave**.
2. El administrador le entrega una **clave temporal nueva** por un medio seguro.
3. Ingrese con ella: el SGC le pedirá elegir una clave propia, como en el primer ingreso
   (sección 3.1).

Al restablecer la clave también se levanta cualquier bloqueo y se cierran las sesiones
que tuviera abiertas. Si tenía segundo factor, lo sigue teniendo: después de la clave le
pedirá el código de la aplicación.

## 9. Resumen de mensajes

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| Usuario o clave incorrectos. Si falló varias veces, la cuenta se bloquea temporalmente; espere o pida al administrador que la desbloquee. | El usuario o la clave no son correctos, o la cuenta está bloqueada o desactivada | Revise mayúsculas y el usuario; si sigue igual, espere o llame al administrador |
| Demasiados intentos desde esta red. Espere un minuto. | Muchos intentos seguidos desde la misma red | Espere un minuto |
| Esa clave es demasiado común; elija otra. | La clave está en la lista de claves muy usadas | Elija otra, por ejemplo una frase de varias palabras |
| Código incorrecto | El código del segundo factor no es el vigente | Espere el código siguiente de la aplicación y escríbalo |
| Se agotaron los intentos del segundo factor. Ingrese de nuevo. | Demasiados códigos equivocados: la cuenta quedó bloqueada | Espere o pida al administrador que la desbloquee |
| Su rol exige segundo factor. Actívelo para continuar. | La entidad exige segundo factor para su rol | Active el segundo factor (sección 6.1) |
| Sin acceso: "Su cuenta no tiene permiso para ver esta sección." | Abrió una página que su rol no puede ver | Pulse **Volver al inicio**; si cree que necesita ese acceso, pídalo al administrador |
