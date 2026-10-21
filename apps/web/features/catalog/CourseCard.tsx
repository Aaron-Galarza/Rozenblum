import type { Course } from "../../types";

type CourseCardProps = {
  course: Course;
  onSelect: (course: Course) => void;
};

export default function CourseCard({ course, onSelect }: CourseCardProps) {
  return (
    <div
      className="flex flex-col group"
      style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderRadius: "4px", overflow: "hidden" }}
    >
      {/* Image */}
      <div className="overflow-hidden" style={{ height: 200 }}>
        <img
          src={course.img}
          alt={course.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-medium tracking-widest uppercase px-2 py-0.5" style={{ backgroundColor: "rgba(23,59,108,0.06)", color: "rgba(23,59,108,0.6)" }}>
            {course.level}
          </span>
          <span className="text-[10px]" style={{ color: "rgba(23,59,108,0.4)" }}>{course.modules} módulos</span>
        </div>

        <h2
          className="text-xl font-medium mb-2 leading-snug"
          style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}
        >
          {course.title}
        </h2>
        <p className="text-xs leading-relaxed flex-1 mb-4" style={{ color: "rgba(23,59,108,0.6)" }}>
          {course.description}
        </p>

        <div className="flex items-center justify-between mb-4">
          <p className="text-2xl font-light" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>
            {course.price}
          </p>
          <p className="text-xs" style={{ color: "rgba(23,59,108,0.45)" }}>ARS</p>
        </div>

        <button
          onClick={() => onSelect(course)}
          className="w-full py-3 text-xs font-bold tracking-widest transition-all duration-200 hover:brightness-110 active:scale-95"
          style={{ backgroundColor: "#173B6C", color: "#B58A43", letterSpacing: "0.12em" }}
        >
          VER DETALLES
        </button>
      </div>
    </div>
  );
}
