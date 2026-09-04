import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ebayRouter from "./ebay";
import accountRouter from "./account";

const router: IRouter = Router();
router.use(healthRouter);
router.use(ebayRouter);
router.use(accountRouter);
export default router;
