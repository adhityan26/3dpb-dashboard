import { redirect } from "next/navigation"

// Redirect all 404s to the main dashboard page
export default function NotFound() {
  redirect("/order")
}
