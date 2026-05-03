import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import adminRouter from "./admin/index.js";
import customerRouter from "./customer.js";
import stripeRouter from "./stripe.js";
import studioRouter from "./studio.js";
import studioV2Router from "./studio-v2.js";
import letrendRouter from "./letrend.js";
import onboardingRouter from "./onboarding.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);

// Customer-facing routes (requires auth, served to logged-in customers)
router.use("/customer", customerRouter);

// Stripe / payment routes
router.use("/stripe", stripeRouter);

// Studio routes (concept analysis + email schedules)
router.use("/studio", studioRouter);

// Studio V2 routes (full CM studio)
router.use("/studio-v2", studioV2Router);

// Letrend / Hagen proxy routes (video library, concept preparation)
router.use("/letrend", letrendRouter);
// top-level /api/video and /api/videos also proxy to Hagen
router.use("/video", letrendRouter);
router.use("/videos", letrendRouter);

// Onboarding context
router.use("/onboarding", onboardingRouter);

export default router;
