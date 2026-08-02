import { toast } from "@/components/ui/toast";

export function toastError(title: string, description?: string) {
  toast.add({
    type: "error",
    title,
    ...(description ? { description } : {}),
  });
}

export function toastInfo(title: string, description?: string) {
  toast.add({
    type: "info",
    title,
    ...(description ? { description } : {}),
  });
}
