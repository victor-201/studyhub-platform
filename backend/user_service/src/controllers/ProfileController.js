import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

export class ProfileController {
  /**
   * @param {Object} deps
   * @param {import('../services/ProfileService.js').ProfileService} deps.profileService
   */
  constructor({ profileService }) {
    this.profileService = profileService;

    // Bind middleware để upload avatar
    this.updateAvatar = [upload.single("avatar"), this.updateAvatar.bind(this)];
  }

  /** Sync user from auth service (internal) */
  async syncUser(req, res) {
    try {
      const user = await this.profileService.syncUser(req.body);
      res.status(201).json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /** Get info */
  async getInfo({ params }, res) {
    try {
      const profile = await this.profileService.getInfo(params.user_id);
      res.json(profile);
    } catch (err) {
      if (err.message === "User not found") {
        res.status(404).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }

  /** Get full profile */
  async getProfile(req, res) {
    try {
      const result = await this.profileService.getProfile({
        target_user_id: req.params.user_id,
        viewer_id: req.user.id,
      });

      res.json(result);
    } catch (err) {
      res.status(403).json({ error: err.message });
    }
  }

  /** Update core profile info and details */
  async updateProfile({ params, body }, res) {
    try {
      const updated = await this.profileService.updateProfile(
        params.user_id,
        body
      );
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  /** Update avatar using Cloudinary */
  async updateAvatar({ params, file }, res) {
    try {
      if (!file) throw new Error("No avatar file uploaded");
      const updated = await this.profileService.updateAvatar(
        params.user_id,
        file.buffer
      );
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  /** Get privacy settings */
  async getPrivacy({ params }, res) {
    try {
      const privacy = await this.profileService.getPrivacy(params.user_id);
      res.json(privacy);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  /** Update privacy settings */
  async updatePrivacy({ params, body }, res) {
    try {
      const updated = await this.profileService.updatePrivacy(
        params.user_id,
        body
      );
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async searchUsers(req, res) {
    try {
      const { query, limit, offset } = req.query;

      const users = await this.profileService.searchUsers({
        keyword: query,
        limit: Number(limit) || 5,
        offset: Number(offset) || 0,
      });

      return res.json(users);
    } catch (err) {
      console.error("Search error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  
  /** Add a social link */
  async addSocialLink({ params, body }, res) {
    try {
      const updated = await this.profileService.addSocialLink(
        params.user_id,
        body.url
      );
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  /** Remove a social link */
  async removeSocialLink({ params }, res) {
    try {
      const deleted = await this.profileService.removeSocialLink(params.id);
      res.json({ success: deleted });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  /** Add interest */
  async addInterest({ params, body }, res) {
    try {
      await this.profileService.addInterest(params.user_id, body.interest);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  /** Remove interest */
  async removeInterest({ params, body }, res) {
    try {
      await this.profileService.removeInterest(params.user_id, body.interest);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}
