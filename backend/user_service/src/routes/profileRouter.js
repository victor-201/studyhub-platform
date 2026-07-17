import { Router } from "express";
import { ProfileController } from "../controllers/ProfileController.js";
import { verifyAccessToken } from "../middlewares/auth.js";

export function createProfileRouter({ profileService }) {
  const router = Router();
  const controller = new ProfileController({ profileService });
  router.get(
    "/search",
    verifyAccessToken,
    controller.searchUsers.bind(controller)
  );
  router.get("/:user_id", controller.getInfo.bind(controller));
  router.post("/sync", controller.syncUser.bind(controller));

  router.get(
    "/detail/:user_id",
    verifyAccessToken,
    controller.getProfile.bind(controller)
  );

  router.put(
    "/:user_id",
    verifyAccessToken,
    controller.updateProfile.bind(controller)
  );

  router.put("/:user_id/avatar", verifyAccessToken, ...controller.updateAvatar);
  router.get(
    "/:user_id/privacy",
    verifyAccessToken,
    controller.getPrivacy.bind(controller)
  );

  router.put(
    "/:user_id/privacy",
    verifyAccessToken,
    controller.updatePrivacy.bind(controller)
  );

  router.post(
    "/:user_id/social",
    verifyAccessToken,
    controller.addSocialLink.bind(controller)
  );

  router.delete(
    "/social/:id",
    verifyAccessToken,
    controller.removeSocialLink.bind(controller)
  );

  router.post(
    "/:user_id/interest",
    verifyAccessToken,
    controller.addInterest.bind(controller)
  );

  router.delete(
    "/:user_id/interest",
    verifyAccessToken,
    controller.removeInterest.bind(controller)
  );

  return router;
}
