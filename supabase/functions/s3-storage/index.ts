import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.731.1";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.731.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const s3Bucket = Deno.env.get("S3_BUCKET")!;
const awsRegion = Deno.env.get("AWS_REGION") || "us-west-2";
const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;

const s3 = new S3Client({
  region: awsRegion,
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  },
});

function safeFileName(fileName: string): string {
  return fileName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-180) || "audio";
}

function buildObjectKey(userId: string, workId: string, fileName: string): string {
  return `private/${userId}/${workId}/${safeFileName(fileName)}`;
}

async function verifyUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!s3Bucket || !awsAccessKeyId || !awsSecretAccessKey) {
      return new Response(
        JSON.stringify({ error: "S3 storage is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const user = await verifyUser(req);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Please sign in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    // POST: create presigned upload URL
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || !body.workId || !body.fileName || !body.fileType) {
        return new Response(
          JSON.stringify({ error: "workId, fileName, and fileType are required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const objectKey = buildObjectKey(user.id, body.workId, body.fileName);
      const command = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: objectKey,
        ContentType: body.fileType,
      });
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

      return new Response(
        JSON.stringify({ uploadUrl, objectKey, expiresInSeconds: 900 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // GET: create presigned download URL
    if (req.method === "GET") {
      const objectKey = url.searchParams.get("objectKey");
      const fileName = url.searchParams.get("fileName") || "audio";
      if (!objectKey) {
        return new Response(
          JSON.stringify({ error: "objectKey is required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Ensure the object belongs to this user
      const expectedPrefix = `private/${user.id}/`;
      if (!objectKey.startsWith(expectedPrefix)) {
        return new Response(
          JSON.stringify({ error: "Access denied." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const command = new GetObjectCommand({
        Bucket: s3Bucket,
        Key: objectKey,
        ResponseContentDisposition: `attachment; filename="${safeFileName(fileName)}"`,
      });
      const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

      return new Response(
        JSON.stringify({ downloadUrl, expiresInSeconds: 300 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // DELETE: delete an S3 object
    if (req.method === "DELETE") {
      const objectKey = url.searchParams.get("objectKey");
      if (!objectKey) {
        return new Response(
          JSON.stringify({ error: "objectKey is required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const expectedPrefix = `private/${user.id}/`;
      if (!objectKey.startsWith(expectedPrefix)) {
        return new Response(
          JSON.stringify({ error: "Access denied." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await s3.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: objectKey }));

      return new Response(
        JSON.stringify({ deleted: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("s3-storage error:", error);
    const message = error instanceof Error ? error.message : "Storage request failed.";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
