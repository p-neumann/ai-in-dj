// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx (line 470).
export function friendlyError(e) {
  var m = e.message || "";
  if (m.indexOf("exceeded_limit") !== -1 || m.indexOf("rate_limit") !== -1) return "Rate Limit Reached — Please Wait A Moment.";
  if (m.indexOf("overloaded") !== -1) return "Claude Is Overloaded — Please Try Again.";
  return "Something Went Wrong — Please Try Again.";
}
