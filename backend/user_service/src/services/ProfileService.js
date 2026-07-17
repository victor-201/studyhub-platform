import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import { uploadToCloudinary } from "../utils/cloudinary.js";

export class ProfileService {
  /**
   * ProfileService constructor
   * @param {Object} deps - Dependencies
   * @param {import('../repos/UserRepository.js').default} deps.userRepo
   * @param {import('../repos/UserProfileDetailsRepository.js').default} deps.profileRepo
   * @param {import('../repos/UserPrivacySettingsRepository.js').default} deps.privacyRepo
   * @param {import('../repos/UserSocialLinksRepository.js').default} deps.socialRepo
   * @param {import('../repos/UserInterestsRepository.js').default} deps.interestsRepo
   */
  constructor({
    userRepo,
    profileRepo,
    privacyRepo,
    socialRepo,
    interestsRepo,
  }) {
    this.userRepo = userRepo;
    this.profileRepo = profileRepo;
    this.privacyRepo = privacyRepo;
    this.socialRepo = socialRepo;
    this.interestsRepo = interestsRepo;
  }

  /**
   * Get full profile of a user including details, privacy, social links and interests
   * @param {string} user_id - ID of the user
   * @returns {Promise<Object>} - Object containing user, details, privacy, socialLinks, interests
   * @throws {Error} If user not found
   */
  async getInfo(user_id) {
    const user = await this.userRepo.findById(user_id);
    if (!user) throw new Error("User not found");
    return { user };
  }

  async syncUser(data) {
    return this.userRepo.createUser(data);
  }

  /**
   * @param {string} target_user_id - ID of the profile owner
   * @param {string} viewer_id - ID of the viewer
   * @returns {Promise<Object>} Profile result with ownership flag
   * @throws {Error} If profile not found or not accessible
   */
  async getProfile({ target_user_id, viewer_id }) {
    const isOwner = target_user_id === viewer_id;

    if (isOwner) {
      const profile = await this.profileRepo.findOwnerProfile(target_user_id);
      if (!profile) throw new Error("User not found");

      return {
        isOwner: true,
        profile,
      };
    }

    const profile = await this.profileRepo.findPublicProfile(target_user_id);
    if (!profile) {
      throw new Error("Profile is private or not found");
    }

    return {
      isOwner: false,
      profile,
    };
  }

  /**
   * Update user's profile information
   * @param {string} user_id - ID of the user
   * @param {Object} data - Profile data
   * @param {string} data.display_name
   * @param {string} data.full_name
   * @param {string} data.bio
   * @param {string} data.gender
   * @param {string} data.birthday
   * @param {string} data.country
   * @param {string} data.city
   * @returns {Promise<Object>} - Updated user and details
   */
  async updateProfile(user_id, data) {
    const updatedUser = await this.userRepo.updateUserById(user_id, {
      display_name: data.display_name,
      full_name: data.full_name,
    });

    const updatedDetails = await this.profileRepo.upsert({
      user_id,
      bio: data.bio,
      gender: data.gender,
      birthday: data.birthday,
      country: data.country,
      city: data.city,
    });

    return { user: updatedUser, details: updatedDetails };
  }

  /**
   * Update user's avatar
   * @param {string} user_id - ID of the user
   * @param {Object} file - File object from multer
   * @param {Buffer|ArrayBuffer} file.buffer - File buffer
   * @param {string} [folder="avatars"] - Cloudinary folder
   * @returns {Promise<Object>} - Updated user with avatar URL
   * @throws {Error} If file is missing, not an image, or user not found
   */
  async updateAvatar(user_id, file, folder = "avatars") {
    if (!file || !file.buffer) throw new Error("No avatar file uploaded");

    const allowedExts = ["jpg", "jpeg", "png", "webp"];

    const type = await fileTypeFromBuffer(file.buffer);
    if (!type || !allowedExts.includes(type.ext)) {
      throw new Error("Uploaded file is not a valid image.");
    }

    const user = await this.userRepo.findById(user_id);
    if (!user) throw new Error("User not found");

    const publicId = `avatar_${user_id}`;
    const buffer = Buffer.isBuffer(file.buffer)
      ? file.buffer
      : Buffer.from(file.buffer);

    const uploaded = await uploadToCloudinary(buffer, {
      folder,
      public_id: publicId,
      overwrite: true,
    });

    return this.userRepo.updateUserById(user_id, {
      avatar_url: uploaded.secure_url,
    });
  }

  /**
   * Get privacy settings of a user
   * @param {string} user_id - ID of the user
   * @returns {Promise<Object>} - Privacy settings
   */
  async getPrivacy(user_id) {
    return this.privacyRepo.findByUserId(user_id);
  }

  /**
   * Update privacy settings of a user
   * @param {string} user_id - ID of the user
   * @param {Object} settings - Privacy settings to update
   * @returns {Promise<Object>} - Updated privacy settings
   */
  async updatePrivacy(user_id, settings) {
    return this.privacyRepo.upsert({ user_id, ...settings });
  }

  /**
   * Search users by query, country or interest
   * @param {Object} filters
   * @param {string} [filters.query] - Search text
   * @param {string} [filters.country] - Country filter
   * @param {string} [filters.interest] - Interest filter
   * @returns {Promise<Array<Object>>} - Array of matched users
   */
  async searchUsers({ keyword, limit = 5, offset = 0 }) {
    const rows = await this.userRepo.searchByKeyword(keyword, limit, offset);

    if (!rows || rows.length === 0) return [];

    return rows.map((row) => ({
      id: row.user_id,
      display_name: row.display_name,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      status: row.status,
      country: row.country,
      city: row.city,
      bio: row.bio,
      gender: row.gender,
      birthday: row.birthday,
    }));
  }

  /**
   * Add or update a social link for a user
   * @param {string} user_id
   * @param {string} url
   */
  async addSocialLink(user_id, url) {
    if (!url) {
      throw new Error("Social link URL is required");
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error("Invalid URL format");
    }

    const host = parsedUrl.hostname.toLowerCase();

    const PLATFORM_MAP = {
      github: ["github.com"],
      linkedin: ["linkedin.com"],
      twitter: ["twitter.com", "x.com"],
      facebook: ["facebook.com"],
      instagram: ["instagram.com"],
      youtube: ["youtube.com", "youtu.be"],
      tiktok: ["tiktok.com"],
      medium: ["medium.com"],
    };

    const platform = Object.entries(PLATFORM_MAP).find(([_, domains]) =>
      domains.some((d) => host.includes(d))
    )?.[0];

    if (!platform) {
      throw new Error("Unsupported social media platform");
    }

    const existing = await this.socialRepo.findByUserAndPlatform(
      user_id,
      platform
    );

    if (existing) {
      return this.socialRepo.updateLink(existing.id, { url });
    }

    return this.socialRepo.createLink({
      id: uuidv4(),
      user_id,
      platform,
      url,
    });
  }

  /**
   * Remove a social link by ID
   * @param {string} id - Social link ID
   * @returns {Promise<number>} - Number of records deleted
   */
  async removeSocialLink(id) {
    return this.socialRepo.deleteLink(id);
  }

  /**
   * Add an interest for a user
   * @param {string} user_id - ID of the user
   * @param {string} interest - Interest name
   * @returns {Promise<Object>} - Added interest record
   */
  async addInterest(user_id, interest) {
    return this.interestsRepo.addInterest(user_id, interest, uuidv4());
  }

  /**
   * Remove an interest for a user
   * @param {string} user_id - ID of the user
   * @param {string} interest - Interest name
   * @returns {Promise<number>} - Number of interests removed
   */
  async removeInterest(user_id, interest) {
    return this.interestsRepo.removeInterest(user_id, interest);
  }
}
