import type { PracticeArea } from "../types";
import { IconBriefcase, IconFamily, IconShield, IconDoc, IconBuilding } from "../components/icons";

export const PRACTICE_AREAS: PracticeArea[] = [
  {
    title: "Derecho Laboral",
    desc: "Indemnizaciones, despidos y relaciones laborales.",
    icon: <IconBriefcase />,
    casos: [
      { q: "¿Te despidieron y no cobraste tu indemnización?", a: "Protegemos tus derechos para que cobres lo que te corresponde. Analizamos tu situación laboral y reclamamos el 100% de la liquidación que te deben." },
      { q: "¿Sufriste un accidente de trabajo?", a: "Reclamamos la ART y al empleador. En muchos casos obtenemos montos muy superiores al ofrecido inicialmente." },
      { q: "¿Te obligaron a renunciar bajo presión?", a: "Esto puede ser un despido encubierto. Podés reclamar como si fuera un despido sin causa." },
    ],
  },
  {
    title: "Derecho de Familia",
    desc: "Divorcios, alimentos, guarda y adopciones.",
    icon: <IconFamily />,
    casos: [
      { q: "¿Querés tramitar un divorcio?", a: "El divorcio expreso puede resolverse en semanas. Te acompañamos desde el inicio hasta la sentencia final." },
      { q: "¿Tu ex no pasa la cuota alimentaria?", a: "Iniciamos la ejecución de alimentos de forma inmediata y reclamamos las cuotas adeudadas con intereses." },
      { q: "¿Tenés conflictos por la guarda de tus hijos?", a: "Buscamos acuerdos que prioricen el bienestar de los menores, con intervención judicial si es necesario." },
    ],
  },
  {
    title: "Derecho Penal",
    desc: "Defensa penal, recursos y asesoramiento.",
    icon: <IconShield />,
    casos: [
      { q: "¿Recibiste una citación judicial?", a: "No concurras solo. Es fundamental contar con asistencia letrada desde el primer momento." },
      { q: "¿Fuiste víctima de un delito?", a: "Te representamos como querellante para que la justicia actúe y obtengas reparación." },
      { q: "¿Un familiar está detenido?", a: "Evaluamos la situación procesal y recurrimos la detención si corresponde. Actuamos con urgencia." },
    ],
  },
  {
    title: "Derecho Civil",
    desc: "Contratos, responsabilidad civil y daños.",
    icon: <IconDoc />,
    casos: [
      { q: "¿Un contrato te generó un perjuicio?", a: "Revisamos la validez del contrato y reclamamos los daños y perjuicios causados." },
      { q: "¿Sufriste un accidente de tránsito?", a: "Reclamamos al responsable y a la aseguradora para cubrir gastos médicos, lucro cesante y daño moral." },
      { q: "¿Necesitás cobrar una deuda?", a: "Iniciamos juicio ejecutivo o monitorio para recuperar lo que te deben de forma eficiente." },
    ],
  },
  {
    title: "Derecho Societario",
    desc: "Constitución, reorganización y litigios empresariales.",
    icon: <IconBuilding />,
    casos: [
      { q: "¿Necesitás constituir una sociedad?", a: "Asesoramos sobre el tipo societario más conveniente y realizamos todos los trámites ante los organismos competentes." },
      { q: "¿Hay conflictos entre socios?", a: "Mediamos y litigamos para proteger tus derechos societarios y el patrimonio de la empresa." },
      { q: "¿Querés cerrar tu empresa?", a: "Gestionamos la disolución y liquidación con cumplimiento de todas las obligaciones legales." },
    ],
  },
];
