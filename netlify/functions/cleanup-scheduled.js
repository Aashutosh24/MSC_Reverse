const { createClient } = require("@supabase/supabase-js");

exports.config = {
  schedule: "0 2 * * *",
};

exports.handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfiguration: missing env vars." }),
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: old, error: fetchErr } = await supabase
    .from("uploads")
    .select("id, file_path")
    .lt("uploaded_at", oneDayAgo);

  if (fetchErr) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: fetchErr.message }),
    };
  }

  if (!old || old.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ deleted: 0, message: "Nothing to clean up." }),
    };
  }

  const paths = old.map((u) => u.file_path);
  await supabase.storage.from("documents").remove(paths);

  const ids = old.map((u) => u.id);
  await supabase.from("uploads").delete().in("id", ids);

  return {
    statusCode: 200,
    body: JSON.stringify({
      deleted: old.length,
      message: `Cleaned up ${old.length} file(s).`,
    }),
  };
};
