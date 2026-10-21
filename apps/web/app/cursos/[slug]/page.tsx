import CourseDetailPage from "../../../features/catalog/CourseDetailPage";

export default async function CursoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CourseDetailPage slug={slug} />;
}
