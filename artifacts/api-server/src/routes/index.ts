import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ingredientsRouter from "./ingredients";
import skusRouter from "./skus";
import dashboardRouter from "./dashboard";
import activityRouter from "./activity";
import teamMembersRouter from "./team-members";
import productionRouter from "./production";
import overheadRouter from "./overhead";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ingredientsRouter);
router.use(skusRouter);
router.use(dashboardRouter);
router.use(activityRouter);
router.use(teamMembersRouter);
router.use(productionRouter);
router.use(overheadRouter);

export default router;
