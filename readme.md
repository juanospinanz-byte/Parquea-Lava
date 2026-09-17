# Parquea-Lava

<img src="image.png" alt="Inicio de sesión" width="300">

en la imagen se puede ver el inicio de sesion que aparece al estar abriendo la aplicacion movil y esta el boton de entrar. si no tienes cuenta puedes registrarte.

---

<img src="image-1.png" alt="Registro" width="300">

en la imagen se muestra de que en el formulario de registro esta la opcion de elegir si es el dueño de un parqueadero o el usuario. 

---

<img src="image-2.png" alt="Cuenta del dueño" width="300">

en esta imagen se muestra el apartado de la cuenta del dueño en la que puede estar agregando las celdas y sus costos incluyendo de que puede poner la ubicacion de su parqueadero

---

<img src="image-3.png" alt="Ubicación del parqueadero" width="300">

en esta imagen se muestra la opcion de que el dueño pueda poner la ubicacion de su parqueadero para que el usuario pueda llevar su vehiculo.

---

<img src="image-4.png" alt="Mapa de parqueaderos" width="300">

en la imagen se muestra el mapa de los parqueaderos cercanos al usuario y que pueda poner la ubicacion del parqueadero, la disponibilidad de las celdas y el precio por hora.

---

<img src="image-5.png" alt="Celdas disponibles" width="300">

en esta imagen se muestra el apartado del usuario en la que puede estar viendo las celdas disponibles y el precio por hora y se muestra la ubicacion del parqueadero.

## paleta de colores

- amarillo: FFE600
- negro: 000000
- blanco: FFFFFF

## flujo de la app

1. Pantalla de Acceso Inicial

Inicio de Sesión: Campos de usuario/correo y contraseña + botón "Iniciar Sesión".

Acceso a Registro: Botón "Crear cuenta" que redirige al Formulario de Registro.

2. Formulario de Registro y Selección de Rol

Datos Básicos: Formulario para ingresar datos personales (Nombre, Correo, Contraseña).

Selección de Tipo de Cuenta: Dos opciones claras mediante botones o selectores:

Dueño de Parqueadero

Usuario / Cliente

Flujo A: Vista del Dueño del Parqueadero

Una vez registrada la cuenta o iniciada la sesión como dueño, accede a su panel de gestión con los siguientes apartados:

Configuración de Celdas Disponibles:

Apartado Motos: Campo numérico para definir/actualizar celdas disponibles para motos.

Apartado Carros: Campo numérico para definir/actualizar celdas disponibles para carros.

Apartado Camiones: Campo numérico para definir/actualizar celdas disponibles para camiones.

Configuración de Ubicación:

Apartado Dirección: Campo de texto o selector en mapa para establecer y publicar la dirección exacta del parqueadero.

Flujo B: Vista del Usuario / Cliente

Al ingresar como cliente, la pantalla principal muestra la información pública ingresada por los dueños:

Consulta de Disponibilidad:

Vista de Celdas: Muestra en tiempo real las celdas disponibles filtradas o desglosadas por Motos, Carros y Camiones (datos sincronizados desde la cuenta del dueño).

Información de Localización:

Vista de Dirección: Apartado visual donde el cliente consulta la dirección exacta cargada por el dueño para saber cómo llegar.