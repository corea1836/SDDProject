import { validateInput } from "@/lib/validation";
import { generateThumbnails, toUserError } from "@/services/thumbnail";
import type { Count, ThumbnailInput } from "@/types/thumbnail";

function badRequest(message: string): Response {
  return Response.json({ error: { message, retryable: false } }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest("요청 형식이 올바르지 않아요");
  }

  const prompt = formData.get("prompt");
  const caption = formData.get("caption");
  const count = formData.get("count");
  const image = formData.get("image");
  const input: ThumbnailInput = {
    mode: formData.get("mode") === "revise" ? "revise" : "create",
    prompt: typeof prompt === "string" ? prompt : "",
    caption: typeof caption === "string" ? caption : "",
    image: image instanceof File && image.size > 0 ? image : null,
    // 2·3·4가 아닌 값은 바로 아래 validateInput이 걸러낸다.
    count: (count === null ? 2 : Number(count)) as Count,
  };

  const [firstError] = Object.values(validateInput(input));
  if (firstError) {
    return badRequest(firstError);
  }

  try {
    const images = await generateThumbnails(input, { signal: request.signal });
    return Response.json({ images });
  } catch (err) {
    const { status, error } = toUserError(err);
    // 프롬프트·문구·OpenAI 원문 메시지는 남기지 않는다.
    console.error("[api/thumbnails] generation failed", {
      status,
      upstreamStatus: err instanceof Error && "status" in err ? err.status : undefined,
    });
    return Response.json({ error }, { status });
  }
}
