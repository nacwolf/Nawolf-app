import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ingredientsRouter from "./ingredients";
import skusRouter from "./skus";
import dashboardRouter from "./dashboard";
import activityRouter from "./activity";
import teamMembersRouter from "./team-members";
import productionRouter from "./production";
import overheadRouter from "./overhead";
import storageRouter from "./storage";
import photosRouter from "./photos";
import packagingRouter from "./packaging";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ingredientsRouter);
router.use(skusRouter);
router.use(dashboardRouter);
router.use(activityRouter);
router.use(teamMembersRouter);
router.use(productionRouter);
router.use(overheadRouter);
router.use(storageRouter);
router.use(photosRouter);
router.use(packagingRouter);

export default router;
