import type { LessonBlockDTO, LessonType } from "@rozenblum/shared";
import type {
  StoredContact,
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredModule,
  StoredOrder,
  StoredSettings,
  StoredUser,
} from "../types.js";

export const DEMO_EMAILS = {
  alumno: "alumno@rozenblum.com",
  profesor: "profesor@rozenblum.com",
  admin: "admin@rozenblum.com",
} as const;

export type SeedUser = Omit<StoredUser, "passwordHash">;

export const SEED_USERS: SeedUser[] = [
  {
    id: "usr_alumno_juan",
    name: "Juan García",
    email: DEMO_EMAILS.alumno,
    role: "alumno",
    status: "Activo",
    initials: "JG",
    createdAt: "2026-08-15T10:00:00.000Z",
  },
  {
    id: "usr_prof_karin",
    name: "Karin Rozenblum",
    email: DEMO_EMAILS.profesor,
    role: "profesor",
    status: "Activo",
    initials: "KR",
    createdAt: "2026-01-10T10:00:00.000Z",
  },
  {
    id: "usr_admin",
    name: "Administrador",
    email: DEMO_EMAILS.admin,
    role: "admin",
    status: "Activo",
    initials: "AD",
    createdAt: "2026-01-10T10:00:00.000Z",
  },
  {
    id: "usr_prof_martin",
    name: "Martín Salas",
    email: "martin@rozenblum.com",
    role: "profesor",
    status: "Activo",
    initials: "MS",
    createdAt: "2026-02-01T10:00:00.000Z",
  },
  {
    id: "usr_prof_valentina",
    name: "Valentina Cruz",
    email: "valentina@rozenblum.com",
    role: "profesor",
    status: "Activo",
    initials: "VC",
    createdAt: "2026-02-01T10:00:00.000Z",
  },
  {
    id: "usr_alumna_maria",
    name: "María López",
    email: "maria@email.com",
    role: "alumno",
    status: "Activo",
    initials: "ML",
    createdAt: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "usr_alumno_carlos",
    name: "Carlos Pérez",
    email: "carlos@email.com",
    role: "alumno",
    status: "Activo",
    initials: "CP",
    createdAt: "2026-08-22T10:00:00.000Z",
  },
  {
    id: "usr_alumna_laura",
    name: "Laura Martínez",
    email: "laura@email.com",
    role: "alumno",
    status: "Activo",
    initials: "LM",
    createdAt: "2026-08-25T10:00:00.000Z",
  },
  {
    id: "usr_alumno_andres",
    name: "Andrés Rivero",
    email: "andres@email.com",
    role: "alumno",
    status: "Activo",
    initials: "AR",
    createdAt: "2026-09-02T10:00:00.000Z",
  },
  {
    id: "usr_alumna_sofia",
    name: "Sofía Ramírez",
    email: "sofia@email.com",
    role: "alumno",
    status: "Suspendido",
    initials: "SR",
    createdAt: "2026-09-12T10:00:00.000Z",
  },
];

const block = (
  id: string,
  type: LessonBlockDTO["type"],
  content: string,
  extra?: Partial<LessonBlockDTO>,
): LessonBlockDTO => ({ id, type, content, ...extra });

const notes22: LessonBlockDTO[] = [
  block("b1", "h1", "Delitos Contra la Propiedad"),
  block(
    "b2",
    "paragraph",
    "En este módulo estudiaremos los delitos que lesionan el patrimonio de las personas. Estos delitos protegen el derecho a la propiedad y el patrimonio económico.",
  ),
  block("b3", "h2", "¿Cuáles son los elementos del robo?"),
  block("b4", "bullet", "", {
    items: [
      "Apoderamiento (tomar algo que no es tuyo)",
      "Cosa mueble (objeto que se puede mover)",
      "Sin consentimiento del dueño",
      "Ánimo de lucro (intención de obtener ganancia)",
    ],
  }),
  block(
    "b5",
    "quote",
    "Art. 162 del Código Penal: Será reprimido con prisión de un mes a seis años, el que se apropiare de una cosa mueble, total o parcialmente ajena...",
  ),
  block("b6", "h3", "Diferencia entre robo y hurto"),
  block(
    "b7",
    "paragraph",
    "El robo se diferencia del hurto en que el robo implica violencia o amenaza, mientras que el hurto es el apoderamiento sin estas circunstancias.",
  ),
  block("b8", "numbered", "", {
    items: [
      "Robo a mano armada: con armas o instrumentos peligrosos",
      "Robo a personas: quitando cosas que la víctima trae consigo",
      "Robo en domicilio: entrando sin consentimiento a casa ajena",
    ],
  }),
  block("b9", "toggle", "Jurisprudencia relevante", {
    expanded: false,
    toggleContent:
      "Fallo de la Corte Suprema (2022): los elementos del tipo deben acreditarse con certeza.\n\nTribunal de Apelación (2023): confirmó el criterio y amplió su aplicación a delitos informáticos.",
  }),
  block("b10", "h2", "Casos prácticos"),
  block(
    "b11",
    "paragraph",
    "Leé el caso documentado en la plataforma de Jurisprudencia Argentina: Caso de Robo a Vivienda (2021).",
  ),
];

const defaultContent = (title: string): LessonBlockDTO[] => [
  block("c1", "h1", title),
  block(
    "c2",
    "paragraph",
    "Material de la lección. Reemplazá este contenido desde el editor del profesor.",
  ),
  block("c3", "h2", "Objetivos"),
  block("c4", "bullet", "", {
    items: ["Comprender los conceptos centrales", "Aplicar la normativa a casos concretos"],
  }),
];

type ModuleSeed = {
  title: string;
  lessons: {
    title: string;
    type: LessonType;
    content?: LessonBlockDTO[];
    highlight?: boolean;
  }[];
};

function buildModules(courseId: number, modules: ModuleSeed[]): StoredModule[] {
  return modules.map((mod, modIndex) => ({
    id: courseId * 100 + modIndex + 1,
    title: mod.title,
    position: modIndex,
    lessons: mod.lessons.map((lesson, lessonIndex) => ({
      id: `${modIndex + 1}.${lessonIndex + 1}`,
      title: lesson.title,
      type: lesson.type,
      position: lessonIndex,
      highlight: lesson.highlight,
      content: lesson.content ?? defaultContent(lesson.title),
    })),
  }));
}

type CourseSeed = Omit<StoredCourse, "modules" | "createdAt" | "updatedAt"> & {
  moduleSeeds: ModuleSeed[];
};

const COURSE_SEEDS: CourseSeed[] = [
  {
    legacyId: 1,
    slug: "practica-procesal-basica",
    title: "Práctica Procesal Básica",
    description:
      "Redacción de escritos, gestión de expedientes y actuación en el proceso civil y laboral argentino.",
    price: "$40.000",
    priceCents: 4_000_000,
    duration: "On-Demand",
    level: "Inicial",
    img: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&h=300&fit=crop&auto=format",
    professor: "Abg. Karin Rozenblum",
    professorEmail: DEMO_EMAILS.profesor,
    status: "published",
    temario: [
      {
        mod: 1,
        title: "Introducción al proceso civil",
        lessons: ["¿Qué es el derecho procesal?", "Principios generales", "Las partes del proceso"],
      },
      {
        mod: 2,
        title: "Redacción de escritos judiciales",
        lessons: ["Estructura del escrito", "Demanda y contestación", "Incidentes procesales"],
      },
      {
        mod: 3,
        title: "Gestión de expedientes",
        lessons: ["El expediente digital", "Notificaciones y plazos", "Recursos ordinarios"],
      },
      {
        mod: 4,
        title: "Práctica laboral",
        lessons: ["SECLO y conciliaciones", "Liquidación de haberes", "Juicio laboral oral"],
      },
    ],
    moduleSeeds: [
      {
        title: "Módulo 1: Introducción al proceso civil",
        lessons: [
          { title: "¿Qué es el derecho procesal?", type: "video" },
          { title: "Principios generales", type: "pdf" },
          { title: "Las partes del proceso", type: "doc" },
        ],
      },
      {
        title: "Módulo 2: Redacción de escritos judiciales",
        lessons: [
          { title: "Estructura del escrito", type: "video" },
          { title: "Demanda y contestación", type: "doc" },
          { title: "Incidentes procesales", type: "ppt" },
        ],
      },
      {
        title: "Módulo 3: Gestión de expedientes",
        lessons: [
          { title: "El expediente digital", type: "video" },
          { title: "Notificaciones y plazos", type: "pdf" },
        ],
      },
    ],
  },
  {
    legacyId: 2,
    slug: "derecho-laboral-practico",
    title: "Derecho Laboral Práctico",
    description:
      "Liquidaciones, SECLO, conciliaciones y manejo de conflictos laborales desde la práctica cotidiana.",
    price: "$35.000",
    priceCents: 3_500_000,
    duration: "On-Demand",
    level: "Intermedio",
    img: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&h=300&fit=crop&auto=format",
    professor: "Dr. Martín Salas",
    professorEmail: "martin@rozenblum.com",
    status: "published",
    temario: [
      {
        mod: 1,
        title: "Relación laboral y contrato",
        lessons: ["Tipos de contratos", "Derechos del trabajador", "Obligaciones del empleador"],
      },
      {
        mod: 2,
        title: "Extinción del vínculo laboral",
        lessons: ["Despido con y sin causa", "Liquidación final", "Indemnizaciones"],
      },
      {
        mod: 3,
        title: "Procedimiento conciliatorio",
        lessons: ["SECLO paso a paso", "Audiencias", "Acuerdos y homologación"],
      },
    ],
    moduleSeeds: [
      {
        title: "Módulo 1: Relación laboral y contrato",
        lessons: [
          { title: "Tipos de contratos", type: "video" },
          { title: "Derechos del trabajador", type: "pdf" },
        ],
      },
      {
        title: "Módulo 2: Extinción del vínculo laboral",
        lessons: [
          { title: "Despido con y sin causa", type: "video" },
          { title: "Liquidación final", type: "ppt" },
        ],
      },
      {
        title: "Módulo 3: Procedimiento conciliatorio",
        lessons: [{ title: "SECLO paso a paso", type: "video" }],
      },
    ],
  },
  {
    legacyId: 3,
    slug: "actualizacion-derecho-familia",
    title: "Actualización en Derecho de Familia",
    description:
      "Reforma del CCyCN, nuevas figuras familiares, alimentos, guarda y procesos de filiación.",
    price: "$38.000",
    priceCents: 3_800_000,
    duration: "On-Demand",
    level: "Avanzado",
    img: "https://images.unsplash.com/photo-1521791055366-0d553872952f?w=600&h=300&fit=crop&auto=format",
    professor: "Abg. Valentina Cruz",
    professorEmail: "valentina@rozenblum.com",
    status: "published",
    temario: [
      {
        mod: 1,
        title: "Matrimonio y unión convivencial",
        lessons: ["Efectos patrimoniales", "Disolución", "Convenio regulador"],
      },
      {
        mod: 2,
        title: "Responsabilidad parental",
        lessons: ["Guarda y cuidado", "Régimen de comunicación", "Alimentos"],
      },
      {
        mod: 3,
        title: "Filiación y adopción",
        lessons: ["Técnicas de reproducción", "Adopción plena y simple", "Jurisprudencia reciente"],
      },
    ],
    moduleSeeds: [
      {
        title: "Módulo 1: Matrimonio y unión convivencial",
        lessons: [
          { title: "Efectos patrimoniales", type: "video" },
          { title: "Convenio regulador", type: "doc" },
        ],
      },
      {
        title: "Módulo 2: Responsabilidad parental",
        lessons: [
          { title: "Guarda y cuidado", type: "video" },
          { title: "Alimentos", type: "pdf" },
        ],
      },
    ],
  },
  {
    legacyId: 4,
    slug: "litigacion-oral",
    title: "Litigación Oral",
    description:
      "Técnicas de argumentación, interrogatorio y teoría del caso aplicadas al proceso oral.",
    price: "$42.000",
    priceCents: 4_200_000,
    duration: "On-Demand",
    level: "Avanzado",
    img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=300&fit=crop&auto=format",
    professor: "Dr. Hernán Vidal",
    professorEmail: "martin@rozenblum.com",
    status: "published",
    temario: [
      {
        mod: 1,
        title: "Teoría del caso",
        lessons: ["Construcción del relato", "Hechos y prueba", "Estrategia procesal"],
      },
      {
        mod: 2,
        title: "Alegato de apertura",
        lessons: ["Estructura", "Lenguaje persuasivo", "Ejercicios prácticos"],
      },
      {
        mod: 3,
        title: "Interrogatorio y contrainterrogatorio",
        lessons: ["Tipos de preguntas", "Control del testigo", "Objeciones"],
      },
      {
        mod: 4,
        title: "Alegato de clausura",
        lessons: ["Síntesis de la evidencia", "Cierre persuasivo", "Simulacro de juicio"],
      },
    ],
    moduleSeeds: [
      {
        title: "Módulo 1: Teoría del caso",
        lessons: [
          { title: "Construcción del relato", type: "video" },
          { title: "Hechos y prueba", type: "pdf" },
        ],
      },
      {
        title: "Módulo 2: Alegato de apertura",
        lessons: [{ title: "Lenguaje persuasivo", type: "video" }],
      },
    ],
  },
  {
    legacyId: 5,
    slug: "derecho-penal-basico",
    title: "Derecho Penal Básico",
    description:
      "Fundamentos del sistema penal argentino, tipos penales frecuentes y actuación en el proceso.",
    price: "$40.000",
    priceCents: 4_000_000,
    duration: "On-Demand",
    level: "Inicial",
    img: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=300&fit=crop&auto=format",
    professor: "Abg. Karin Rozenblum",
    professorEmail: DEMO_EMAILS.profesor,
    status: "published",
    temario: [
      {
        mod: 1,
        title: "El sistema penal",
        lessons: ["Principios constitucionales", "Acción penal", "Sujetos procesales"],
      },
      {
        mod: 2,
        title: "Delitos frecuentes",
        lessons: ["Contra la propiedad", "Contra las personas", "En el ámbito laboral"],
      },
      {
        mod: 3,
        title: "El proceso penal",
        lessons: ["Etapa investigativa", "Procesamiento y prisión preventiva", "Juicio oral"],
      },
      {
        mod: 4,
        title: "Recursos y ejecución",
        lessons: ["Apelación y casación", "Suspensión del proceso", "Ejecución de la pena"],
      },
    ],
    moduleSeeds: [
      {
        title: "Módulo 1: Introducción",
        lessons: [
          { title: "¿Qué es el derecho penal?", type: "video" },
          { title: "Conceptos básicos", type: "pdf" },
        ],
      },
      {
        title: "Módulo 2: Delitos contra la propiedad",
        lessons: [
          { title: "Introducción al módulo", type: "video" },
          {
            title: "Delitos contra la propiedad",
            type: "ppt",
            highlight: true,
            content: notes22,
          },
        ],
      },
      {
        title: "Módulo 3: Delitos contra las personas",
        lessons: [{ title: "Delitos contra las personas", type: "video" }],
      },
      {
        title: "Módulo 4: Proceso penal",
        lessons: [],
      },
    ],
  },
  {
    legacyId: 6,
    slug: "contratos-civiles-comerciales",
    title: "Contratos Civiles y Comerciales",
    description:
      "Redacción y revisión de contratos, cláusulas esenciales y resolución de conflictos contractuales.",
    price: "$36.000",
    priceCents: 3_600_000,
    duration: "On-Demand",
    level: "Intermedio",
    img: "https://images.unsplash.com/photo-1556157382-97eda2d62296?w=600&h=300&fit=crop&auto=format",
    professor: "Dr. Hernán Vidal",
    professorEmail: "martin@rozenblum.com",
    status: "draft",
    temario: [
      {
        mod: 1,
        title: "Teoría general del contrato",
        lessons: ["Formación y perfección", "Objeto y causa", "Nulidades"],
      },
      {
        mod: 2,
        title: "Contratos típicos frecuentes",
        lessons: ["Compraventa", "Locación", "Prestación de servicios"],
      },
      {
        mod: 3,
        title: "Incumplimiento y remedios",
        lessons: ["Responsabilidad contractual", "Daños y perjuicios", "Resolución extrajudicial"],
      },
    ],
    moduleSeeds: [
      {
        title: "Módulo 1: Teoría general del contrato",
        lessons: [
          { title: "Formación y perfección", type: "video" },
          { title: "Nulidades", type: "pdf" },
        ],
      },
      {
        title: "Módulo 2: Contratos típicos frecuentes",
        lessons: [{ title: "Compraventa y locación", type: "video" }],
      },
    ],
  },
];

export const SEED_COURSES: StoredCourse[] = COURSE_SEEDS.map(
  ({ moduleSeeds, ...course }) => ({
    ...course,
    modules: buildModules(course.legacyId, moduleSeeds),
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-10-21T12:00:00.000Z",
  }),
);

export const SEED_ENROLLMENTS: StoredEnrollment[] = [
  {
    id: "enr_juan_penal",
    studentEmail: DEMO_EMAILS.alumno,
    studentName: "Juan García",
    courseId: 5,
    status: "Activo",
    startedAt: "2026-08-15T10:00:00.000Z",
    completedLessonIds: ["1.1", "1.2", "2.1"],
  },
  {
    id: "enr_maria_laboral",
    studentEmail: "maria@email.com",
    studentName: "María López",
    courseId: 2,
    status: "Activo",
    startedAt: "2026-08-20T10:00:00.000Z",
    completedLessonIds: ["1.1", "1.2"],
  },
  {
    id: "enr_carlos_penal",
    studentEmail: "carlos@email.com",
    studentName: "Carlos Pérez",
    courseId: 5,
    status: "Activo",
    startedAt: "2026-08-22T10:00:00.000Z",
    completedLessonIds: ["1.1", "1.2", "2.1", "2.2"],
  },
  {
    id: "enr_laura_familia",
    studentEmail: "laura@email.com",
    studentName: "Laura Martínez",
    courseId: 3,
    status: "Activo",
    startedAt: "2026-08-25T10:00:00.000Z",
    completedLessonIds: [],
  },
  {
    id: "enr_andres_penal",
    studentEmail: "andres@email.com",
    studentName: "Andrés Rivero",
    courseId: 5,
    status: "Activo",
    startedAt: "2026-09-02T10:00:00.000Z",
    completedLessonIds: ["1.1", "1.2", "2.1", "2.2", "3.1"],
  },
  {
    id: "enr_juan_procesal",
    studentEmail: DEMO_EMAILS.alumno,
    studentName: "Juan García",
    courseId: 1,
    status: "Activo",
    startedAt: "2026-09-10T10:00:00.000Z",
    completedLessonIds: ["1.1"],
  },
];

type OrderSeed = Omit<StoredOrder, "curso" | "monto" | "courseId" | "courseSlug"> & {
  courseId: number;
};

const ORDER_SEEDS: OrderSeed[] = [
  {
    id: "ORD-001",
    externalReference: "RB-2026-0001",
    alumno: "Juan García",
    email: DEMO_EMAILS.alumno,
    courseId: 5,
    montoCents: 4_000_000,
    fecha: "15/08/2026",
    metodo: "MercadoPago",
    estado: "Pagado",
    createdAt: "2026-08-15T10:05:00.000Z",
  },
  {
    id: "ORD-002",
    externalReference: "RB-2026-0002",
    alumno: "María López",
    email: "maria@email.com",
    courseId: 2,
    montoCents: 3_500_000,
    fecha: "20/08/2026",
    metodo: "Stripe",
    estado: "Pagado",
    createdAt: "2026-08-20T11:30:00.000Z",
  },
  {
    id: "ORD-003",
    externalReference: "RB-2026-0003",
    alumno: "Carlos Pérez",
    email: "carlos@email.com",
    courseId: 5,
    montoCents: 4_000_000,
    fecha: "22/08/2026",
    metodo: "MercadoPago",
    estado: "Pagado",
    createdAt: "2026-08-22T09:15:00.000Z",
  },
  {
    id: "ORD-004",
    externalReference: "RB-2026-0004",
    alumno: "Laura Martínez",
    email: "laura@email.com",
    courseId: 3,
    montoCents: 3_800_000,
    fecha: "25/08/2026",
    metodo: "Transferencia",
    estado: "Pagado",
    createdAt: "2026-08-25T16:40:00.000Z",
  },
  {
    id: "ORD-005",
    externalReference: "RB-2026-0005",
    alumno: "Andrés Rivero",
    email: "andres@email.com",
    courseId: 5,
    montoCents: 4_000_000,
    fecha: "02/09/2026",
    metodo: "MercadoPago",
    estado: "Pagado",
    createdAt: "2026-09-02T08:20:00.000Z",
  },
  {
    id: "ORD-006",
    externalReference: "RB-2026-0006",
    alumno: "Sofía Ramírez",
    email: "sofia@email.com",
    courseId: 4,
    montoCents: 4_200_000,
    fecha: "12/09/2026",
    metodo: "Stripe",
    estado: "Pendiente",
    createdAt: "2026-09-12T13:10:00.000Z",
  },
  {
    id: "ORD-007",
    externalReference: "RB-2026-0007",
    alumno: "Juan García",
    email: DEMO_EMAILS.alumno,
    courseId: 1,
    montoCents: 4_000_000,
    fecha: "10/09/2026",
    metodo: "MercadoPago",
    estado: "Pagado",
    createdAt: "2026-09-10T09:00:00.000Z",
  },
  {
    id: "ORD-008",
    externalReference: "RB-2026-0008",
    alumno: "María López",
    email: "maria@email.com",
    courseId: 1,
    montoCents: 4_000_000,
    fecha: "18/07/2026",
    metodo: "Stripe",
    estado: "Pagado",
    createdAt: "2026-07-18T10:00:00.000Z",
  },
  {
    id: "ORD-009",
    externalReference: "RB-2026-0009",
    alumno: "Carlos Pérez",
    email: "carlos@email.com",
    courseId: 6,
    montoCents: 3_600_000,
    fecha: "05/06/2026",
    metodo: "MercadoPago",
    estado: "Pagado",
    createdAt: "2026-06-05T10:00:00.000Z",
  },
  {
    id: "ORD-010",
    externalReference: "RB-2026-0010",
    alumno: "Laura Martínez",
    email: "laura@email.com",
    courseId: 2,
    montoCents: 3_500_000,
    fecha: "21/05/2026",
    metodo: "Transferencia",
    estado: "Pagado",
    createdAt: "2026-05-21T10:00:00.000Z",
  },
  {
    id: "ORD-011",
    externalReference: "RB-2026-0011",
    alumno: "Andrés Rivero",
    email: "andres@email.com",
    courseId: 4,
    montoCents: 4_200_000,
    fecha: "14/04/2026",
    metodo: "Stripe",
    estado: "Reembolsado",
    createdAt: "2026-04-14T10:00:00.000Z",
  },
  {
    id: "ORD-012",
    externalReference: "RB-2026-0012",
    alumno: "Sofía Ramírez",
    email: "sofia@email.com",
    courseId: 3,
    montoCents: 3_800_000,
    fecha: "03/03/2026",
    metodo: "MercadoPago",
    estado: "Pagado",
    createdAt: "2026-03-03T10:00:00.000Z",
  },
  {
    id: "ORD-013",
    externalReference: "RB-2026-0013",
    alumno: "María López",
    email: "maria@email.com",
    courseId: 4,
    montoCents: 4_200_000,
    fecha: "19/02/2026",
    metodo: "Stripe",
    estado: "Pagado",
    createdAt: "2026-02-19T10:00:00.000Z",
  },
  {
    id: "ORD-014",
    externalReference: "RB-2026-0014",
    alumno: "Carlos Pérez",
    email: "carlos@email.com",
    courseId: 2,
    montoCents: 3_500_000,
    fecha: "27/01/2026",
    metodo: "MercadoPago",
    estado: "Rechazado",
    createdAt: "2026-01-27T10:00:00.000Z",
  },
];

export const SEED_ORDERS: StoredOrder[] = ORDER_SEEDS.map((order) => {
  const course = SEED_COURSES.find((c) => c.legacyId === order.courseId);
  if (!course) throw new Error(`Curso inexistente en seed: ${order.courseId}`);
  return {
    ...order,
    curso: course.title,
    courseSlug: course.slug,
    monto: course.price,
  };
});

export const SEED_CONVERSATIONS: StoredConversation[] = [
  {
    id: "cnv_juan_penal",
    courseId: 5,
    studentEmail: DEMO_EMAILS.alumno,
    studentName: "Juan García",
    teacherEmail: DEMO_EMAILS.profesor,
    teacherName: "Karin Rozenblum",
    messages: [
      {
        id: "msg_1",
        from: "prof",
        text: "Hola Juan, recuerda que el material del módulo 2 incluye casos prácticos. ¡Cualquier consulta no dudes en escribirme!",
        time: "Prof. Rozenblum · 14:32",
        createdAt: "2026-10-19T14:32:00.000Z",
      },
      {
        id: "msg_2",
        from: "me",
        text: "Muchas gracias! Tengo una duda sobre la lección 2.2, ¿puedo enviarle el ejercicio para revisión?",
        time: "Tú · 15:10",
        createdAt: "2026-10-19T15:10:00.000Z",
      },
      {
        id: "msg_3",
        from: "prof",
        text: "Por supuesto, podés subir el ejercicio al foro del módulo. Lo reviso esta tarde.",
        time: "Prof. Rozenblum · 15:45",
        createdAt: "2026-10-19T15:45:00.000Z",
      },
    ],
  },
  {
    id: "cnv_maria_laboral",
    courseId: 2,
    studentEmail: "maria@email.com",
    studentName: "María López",
    teacherEmail: "martin@rozenblum.com",
    teacherName: "Martín Salas",
    messages: [
      {
        id: "msg_1",
        from: "me",
        text: "Profesor, ¿la liquidación final incluye SAC proporcional?",
        time: "María · 10:12",
        createdAt: "2026-10-20T10:12:00.000Z",
      },
      {
        id: "msg_2",
        from: "prof",
        text: "Sí, incluido el proporcional del semestre en curso.",
        time: "Prof. Salas · 10:40",
        createdAt: "2026-10-20T10:40:00.000Z",
      },
      {
        id: "msg_3",
        from: "me",
        text: "Perfecto, muchas gracias.",
        time: "María · 10:42",
        createdAt: "2026-10-20T10:42:00.000Z",
      },
    ],
  },
];

export const SEED_SETTINGS: StoredSettings = {
  companyName: "Estudio Jurídico Rozenblum",
  supportEmail: "soporte@estudio.com",
  logoUrl:
    "https://res.cloudinary.com/dwqxdensk/image/upload/v1787947835/461451735_1057750859400196_1143453419980232675_n_nt27kp.png",
  privacyText:
    "Al utilizar nuestra plataforma, usted acepta los presentes Términos y Condiciones. Los datos personales serán tratados conforme a la Ley 25.326 de Protección de Datos Personales de la República Argentina. El Estudio Jurídico Rozenblum se reserva el derecho de modificar estos términos en cualquier momento.",
  updatedAt: "2026-10-21T12:00:00.000Z",
};

export const SEED_CONTACTS: StoredContact[] = [];
