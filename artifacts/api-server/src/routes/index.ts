import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import shareRouter from "./share";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(shareRouter);

export default router;
