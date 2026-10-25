import { useEffect, useState } from "react";
import { request } from "../services/api";
export default function useJob(id) {
  const [job, setJob] = useState(null);
  useEffect(() => {
    setJob(null);
    if (!id) return;
    let active = true,
      source = new EventSource("/api/jobs/" + id + "/events"),
      poll;
    const accept = (data) => {
      if (!active) return;
      setJob(data);
      if (["completed", "cancelled", "failed"].includes(data.status)) {
        source.close();
        clearInterval(poll);
      }
    };
    source.onmessage = (event) => {
      try {
        accept(JSON.parse(event.data));
      } catch {}
    };
    source.onerror = () => {
      source.close();
      if (!poll)
        poll = setInterval(
          () =>
            request("/jobs/" + id)
              .then(accept)
              .catch((error) => {
                if (active)
                  setJob({ id, status: "failed", error: error.message });
                clearInterval(poll);
              }),
          1500,
        );
    };
    return () => {
      active = false;
      source.close();
      clearInterval(poll);
    };
  }, [id]);
  return job;
}
