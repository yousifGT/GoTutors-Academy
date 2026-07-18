import { redirect } from "next/navigation";

/** Old course-editor URL — kept as a redirect so existing links (admin list, dashboards, notifications) still work. */
export default function CourseEditorRedirect({ params }: { params: { id: string } }) {
  redirect(`/instructor/courses/${params.id}/curriculum`);
}
