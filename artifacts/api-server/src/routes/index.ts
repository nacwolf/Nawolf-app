import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ingredientsRouter from "./ingredients";
import skusRouter from "./skus";
import dashboardRouter from "./dashboard";
import activityRouter from "./activity";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ingredientsRouter);
router.use(skusRouter);
router.use(dashboardRouter);
router.use(activityRouter);

export default router;
