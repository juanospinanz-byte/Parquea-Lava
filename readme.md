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

## Flujo de app

### 1. Pantalla de Acceso Inicial
  * Inicio de Sesión:
  * Campos de entrada: Correo / Usuario y Contraseña.
  * Botón: Iniciar Sesión.
  * Registro:
  * Botón de redirección hacia el Formulario de Registro.

### 2. Registro y Selección de Rol
  * Registro de Usuario:
  * Formulario de datos básicos (Nombre, Correo, Contraseña).
  * Selección del Tipo de Cuenta:
  * Dueño de Parqueadero
  * Usuario / Cliente

---

## Flujos según el Tipo de Usuario

### Flujo: Dueño del Parqueadero
Panel de administración para configurar la oferta del parqueadero:

1. Gestión de Celdas Disponibles:
   * Motos: Módulo para ingresar/actualizar celdas disponibles.
   * Carros: Módulo para ingresar/actualizar celdas disponibles.
   * Camiones: Módulo para ingresar/actualizar celdas disponibles.
2. Ubicación del Parqueadero:
   * Dirección: Sección para ingresar la dirección exacta y la ubicación visual visible para los clientes.

---

### Flujo: Usuario / Cliente
Vista de consulta en tiempo real para clientes:

1. Consulta de Disponibilidad:
   * Visualización clara del número de celdas disponibles desglosadas por vehículo (Motos, Carros y Camiones), sincronizadas directamente desde la cuenta del dueño.
2. Ubicación y Dirección:
   * Apartado dedicado a consultar la dirección del parqueadero registrada por el dueño.