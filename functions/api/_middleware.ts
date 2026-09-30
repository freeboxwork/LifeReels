import { LIFEREELS_RETIRED, retiredResponse } from "../../shared/serviceRetirement";

// Block all API methods before auth, payment, database, bridge or provider calls.
export const onRequest: PagesFunction = (context) => {
  if (LIFEREELS_RETIRED) return retiredResponse();
  return context.next();
};
