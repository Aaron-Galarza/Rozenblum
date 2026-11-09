import CourseDetailPage from "../../../features/catalog/CourseDetailPage";
import type { Metadata } from "next";
import type { CourseDetailDTO } from "@rozenblum/shared";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await fetch(`${apiUrl}/api/courses/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) return { title: "Curso no disponible", robots: { index: false, follow: false } };
    const payload = await response.json() as { data?: CourseDetailDTO };
    const course = payload.data?.course;
    if (!course || course.status !== "published") return { title: "Curso no disponible", robots: { index: false, follow: false } };
    return {
      title: course.title,
      description: course.description,
      robots: { index: true, follow: true },
      openGraph: { type: "website", title: course.title, description: course.description, ...(course.img ? { images: [course.img] } : {}) },
      ...(process.env.NEXT_PUBLIC_SITE_URL ? { alternates: { canonical: `/cursos/${encodeURIComponent(slug)}` } } : {}),
    };
  } catch {
    return { title: "Curso", robots: { index: false, follow: false } };
  }
}

export default async function CursoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CourseDetailPage slug={slug} />;
}
