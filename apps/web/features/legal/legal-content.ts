export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export type LegalSection = { heading: string; blocks: LegalBlock[] };

export const privacySections: LegalSection[] = [
  { heading: "1. Responsable del tratamiento", blocks: [
    { type: "paragraph", text: "El Estudio Jurídico Rozenblum, con domicilio de atención en Corrientes 1177, Resistencia, Chaco, Argentina, es responsable del tratamiento de los datos personales recopilados mediante su plataforma web, de acuerdo con las funciones y servicios habilitados." },
    { type: "paragraph", text: "Para consultas relacionadas con la protección de datos personales, los usuarios podrán comunicarse a: estudiojuridicorozenblum@gmail.com" },
  ] },
  { heading: "2. Alcance", blocks: [
    { type: "paragraph", text: "Esta política describe cómo se recopilan, utilizan y protegen los datos personales de quienes visitan el sitio, realizan consultas, se inscriben a cursos o utilizan las funcionalidades educativas de la plataforma." },
  ] },
  { heading: "3. Información recopilada", blocks: [
    { type: "paragraph", text: "Según las funcionalidades utilizadas, la plataforma podrá tratar:" },
    { type: "list", items: ["Nombre y apellido.", "Correo electrónico.", "Datos de identificación requeridos para el registro, cuando corresponda.", "Información de cuenta y perfil.", "Inscripciones y cursos adquiridos.", "Registros de órdenes y estados de pago.", "Avance y progreso académico.", "Mensajes intercambiados mediante el chat privado entre alumnos y docentes.", "Información técnica necesaria para el funcionamiento y seguridad del servicio."] },
    { type: "paragraph", text: "Los formularios deberán identificar qué información es obligatoria y cuál es opcional." },
  ] },
  { heading: "4. Finalidades del tratamiento", blocks: [
    { type: "paragraph", text: "Los datos personales serán utilizados para:" },
    { type: "list", items: ["Gestionar cuentas de usuario.", "Procesar inscripciones.", "Administrar el acceso a cursos.", "Registrar el progreso educativo.", "Facilitar la comunicación entre alumnos y profesores.", "Gestionar consultas.", "Registrar operaciones y estados de pago.", "Mantener la seguridad y el correcto funcionamiento de la plataforma.", "Cumplir las obligaciones legales aplicables."] },
    { type: "paragraph", text: "No se utilizarán datos para finalidades incompatibles con aquellas informadas al momento de recopilarlos." },
  ] },
  { heading: "5. Inscripciones y pagos", blocks: [
    { type: "paragraph", text: "Los pagos de cursos se realizan mediante las pasarelas habilitadas por el Estudio, inicialmente Mercado Pago." },
    { type: "paragraph", text: "Los fondos se reciben en cuentas pertenecientes al Estudio Jurídico Rozenblum." },
    { type: "paragraph", text: "La plataforma podrá almacenar identificadores de operaciones, referencias de pago y estados necesarios para gestionar las inscripciones." },
    { type: "paragraph", text: "El tratamiento de datos realizado directamente por la pasarela de pagos se encuentra sujeto también a las políticas del proveedor correspondiente." },
  ] },
  { heading: "6. Prestadores tecnológicos", blocks: [
    { type: "paragraph", text: "AFdevelopers participa como proveedor técnico de desarrollo y mantenimiento, siguiendo las instrucciones documentadas del Estudio." },
    { type: "paragraph", text: "La plataforma también utiliza servicios tecnológicos necesarios para su funcionamiento, como alojamiento web, servidores, bases de datos y alojamiento de videos." },
    { type: "paragraph", text: "La identificación de los proveedores definitivos, sus posibles transferencias de datos y las condiciones aplicables deberán verificarse antes de aprobar esta política." },
    { type: "paragraph", text: "AFdevelopers no está autorizada contractualmente a vender, reutilizar o divulgar los datos del Estudio para finalidades propias." },
  ] },
  { heading: "7. Seguridad", blocks: [
    { type: "paragraph", text: "El Estudio y sus prestadores técnicos aplicarán medidas razonables de seguridad destinadas a proteger la información y limitar el acceso a personas autorizadas." },
    { type: "paragraph", text: "La plataforma utiliza mecanismos de autenticación y permisos diferenciados según el rol de cada usuario." },
  ] },
  { heading: "8. Conservación de información", blocks: [
    { type: "paragraph", text: "Los datos se conservarán durante el tiempo necesario para cumplir las finalidades informadas y las obligaciones legales aplicables." },
    { type: "paragraph", text: "Los plazos concretos y los procedimientos de eliminación deberán confirmarse antes de aprobar la versión definitiva de esta política." },
  ] },
  { heading: "9. Derechos de los usuarios", blocks: [
    { type: "paragraph", text: "Conforme a la Ley 25.326, los titulares podrán solicitar el acceso, la rectificación, actualización o supresión de sus datos personales, en las condiciones previstas por la normativa vigente." },
    { type: "paragraph", text: "Las solicitudes podrán dirigirse al correo de contacto indicado." },
    { type: "paragraph", text: "La Agencia de Acceso a la Información Pública es la autoridad nacional competente en materia de protección de datos personales." },
  ] },
  { heading: "10. Modificaciones", blocks: [
    { type: "paragraph", text: "Esta política podrá actualizarse para reflejar cambios en la plataforma, sus proveedores o las disposiciones legales aplicables." },
    { type: "paragraph", text: "La versión vigente y su fecha de actualización deberán estar disponibles para los usuarios." },
  ] },
];

export const termsSections: LegalSection[] = [
  { heading: "1. Objeto", blocks: [
    { type: "paragraph", text: "La plataforma del Estudio Jurídico Rozenblum ofrece información institucional, un catálogo de cursos y herramientas para la formación educativa a distancia." },
    { type: "paragraph", text: "Estos términos regulan las condiciones generales de utilización de las funcionalidades disponibles para visitantes, alumnos y profesores." },
  ] },
  { heading: "2. Registro y cuentas", blocks: [
    { type: "paragraph", text: "Para acceder a determinadas funcionalidades educativas será necesario disponer de una cuenta individual." },
    { type: "paragraph", text: "Cada usuario deberá proporcionar información correcta y mantener la confidencialidad de sus credenciales." },
    { type: "paragraph", text: "El acceso a funciones y contenidos dependerá de los permisos asignados a su cuenta." },
  ] },
  { heading: "3. Catálogo e inscripciones", blocks: [
    { type: "paragraph", text: "Cada curso podrá presentar información sobre sus contenidos, profesor, precio, duración y demás características." },
    { type: "paragraph", text: "Las condiciones particulares de cada curso deberán informarse antes de completar la inscripción o compra." },
    { type: "paragraph", text: "La disponibilidad podrá estar sujeta a fechas de inscripción y condiciones específicas informadas para cada curso." },
  ] },
  { heading: "4. Pagos", blocks: [
    { type: "paragraph", text: "Los pagos se procesarán mediante la pasarela habilitada por el Estudio, inicialmente Mercado Pago." },
    { type: "paragraph", text: "Los importes se abonarán a cuentas pertenecientes al Estudio Jurídico Rozenblum." },
    { type: "paragraph", text: "La inscripción y habilitación del acceso estarán vinculadas a la verificación del pago correspondiente." },
    { type: "paragraph", text: "Una operación pendiente, rechazada o no verificada no deberá considerarse automáticamente como pago aprobado." },
  ] },
  { heading: "5. Acceso al aula virtual", blocks: [
    { type: "paragraph", text: "Los alumnos podrán acceder a los cursos en los que se encuentren inscriptos y habilitados." },
    { type: "paragraph", text: "El contenido educativo podrá incluir módulos, lecciones, textos, archivos PDF, enlaces y videos alojados mediante servicios externos." },
    { type: "paragraph", text: "La disponibilidad de un curso podrá estar limitada por las condiciones de acceso y vencimiento informadas al momento de la inscripción." },
  ] },
  { heading: "6. Progreso académico", blocks: [
    { type: "paragraph", text: "La plataforma podrá registrar el avance del alumno a través de las lecciones y módulos disponibles." },
    { type: "paragraph", text: "El seguimiento del progreso constituye una funcionalidad educativa de la plataforma." },
    { type: "paragraph", text: "La emisión de certificados, evaluaciones y otras prestaciones adicionales no se encuentra incluida salvo que el Estudio las anuncie y acuerde expresamente." },
  ] },
  { heading: "7. Comunicación con docentes", blocks: [
    { type: "paragraph", text: "La plataforma permite la comunicación privada entre alumnos y profesores vinculados a un curso." },
    { type: "paragraph", text: "Los usuarios deberán emplear este canal de manera respetuosa y relacionada con las actividades educativas." },
    { type: "paragraph", text: "El chat no constituye un canal de atención de emergencias ni implica disponibilidad permanente del docente." },
  ] },
  { heading: "8. Materiales educativos", blocks: [
    { type: "paragraph", text: "Los materiales publicados pertenecen a sus respectivos titulares de derechos." },
    { type: "paragraph", text: "El acceso a un curso no implica la cesión de derechos de propiedad intelectual sobre sus contenidos." },
    { type: "paragraph", text: "La reproducción, distribución o publicación de materiales fuera de los usos autorizados requerirá el permiso correspondiente." },
  ] },
  { heading: "9. Disponibilidad del servicio", blocks: [
    { type: "paragraph", text: "El Estudio procurará mantener la plataforma operativa y gestionar las incidencias técnicas que se presenten." },
    { type: "paragraph", text: "Determinadas funcionalidades dependen de proveedores tecnológicos externos, incluyendo servicios de alojamiento, reproducción de videos y procesamiento de pagos." },
    { type: "paragraph", text: "Los problemas técnicos deberán comunicarse mediante los canales de contacto habilitados." },
    { type: "paragraph", text: "Esta cláusula no limita los derechos que correspondan a los usuarios por la legislación aplicable." },
  ] },
  { heading: "10. Cancelaciones, devoluciones y revocación", blocks: [
    { type: "paragraph", text: "Las condiciones comerciales particulares, los procedimientos de cancelación y las devoluciones deberán comunicarse de forma clara antes de completar una compra." },
    { type: "paragraph", text: "Los derechos de los consumidores reconocidos por la legislación argentina serán respetados." },
    { type: "paragraph", text: "Antes de habilitar ventas en producción, el Estudio deberá aprobar las condiciones concretas de cancelación, devolución y los mecanismos legalmente exigibles para ejercer esos derechos." },
    { type: "paragraph", text: "No se establecerán restricciones a los derechos legales de los usuarios mediante estas condiciones." },
  ] },
  { heading: "11. Datos personales", blocks: [
    { type: "paragraph", text: "El tratamiento de datos personales se describe en la Política de Privacidad disponible en esta misma plataforma." },
  ] },
  { heading: "12. Contacto", blocks: [
    { type: "paragraph", text: "Para consultas relacionadas con la plataforma, inscripciones o utilización de los servicios:" },
    { type: "paragraph", text: "Estudio Jurídico Rozenblum" },
    { type: "paragraph", text: "Corrientes 1177, Resistencia, Chaco, Argentina." },
    { type: "paragraph", text: "Correo: estudiojuridicorozenblum@gmail.com" },
    { type: "paragraph", text: "Teléfono: +54 9 362 466-8878" },
  ] },
  { heading: "13. Actualizaciones", blocks: [
    { type: "paragraph", text: "Los términos podrán actualizarse cuando cambien las funcionalidades, condiciones comerciales o exigencias legales." },
    { type: "paragraph", text: "Las modificaciones se comunicarán según su naturaleza y las disposiciones legales aplicables, sin afectar derechos adquiridos." },
  ] },
];
