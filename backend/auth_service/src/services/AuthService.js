import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import https from "https";
import bcrypt from "bcrypt";
import { signAccessToken, signRefreshToken } from "../utils/jwt.js";
import { createTokenHash } from "../utils/tokenHash.js";
import { env } from "../config/env.js";

export class AuthService {
  /**
   * @param {Object} deps - Dependency injection
   * @param {import("../repos/UserRepository.js").UserRepository} deps.userRepo
   * @param {import("../repos/UserEmailRepository.js").UserEmailRepository} deps.userEmailRepo
   * @param {import("../repos/SessionRepository.js").SessionRepository} deps.sessionRepo
   * @param {import("../repos/PasswordResetRepository.js").PasswordResetRepository} deps.passwordResetRepo
   * @param {import("../repos/EmailVerificationRepository.js").EmailVerificationRepository} deps.emailVerificationRepo
   * @param {import("../repos/AuditLogRepository.js").AuditLogRepository} deps.auditRepo
   * @param {import("../repos/UserRoleRepository.js").UserRoleRepository} deps.userRoleRepo
   * @param {import("../repos/RoleRepository.js").RoleRepository} deps.roleRepo
   * @param {import("../services/EmailService.js").EmailService} deps.emailService
   */
  constructor({
    userRepo,
    userEmailRepo,
    sessionRepo,
    passwordResetRepo,
    emailVerificationRepo,
    auditRepo,
    userRoleRepo,
    roleRepo,
    outboxRepo,
    emailService,
  }) {
    this.emailService = emailService;
    this.userRepo = userRepo;
    this.userEmailRepo = userEmailRepo;
    this.sessionRepo = sessionRepo;
    this.passwordResetRepo = passwordResetRepo;
    this.emailVerificationRepo = emailVerificationRepo;
    this.auditRepo = auditRepo;
    this.userRoleRepo = userRoleRepo;
    this.roleRepo = roleRepo;
    this.outboxRepo = outboxRepo;
    this.SALT_ROUNDS = 10;
  }

  /**
   * Send verification email
   * @param {Object} userEmail
   * @param {string} userEmail.user_name
   * @param {string} [user_agent]
   * @param {string} [ip]
   * @returns {Promise<string>} Verification token
   */
  async sendVerificationEmail(userEmail, user_agent = null, ip = null) {
    if (!userEmail) throw new Error("User email required");

    const existingTokens = await this.emailVerificationRepo.findByUserEmailId(
      userEmail.id
    );
    for (const token of existingTokens) {
      if (!token.used_at) {
        await this.emailVerificationRepo.deleteToken(token.id);
      }
    }

    const token = crypto.randomBytes(32).toString("hex");
    await this.emailVerificationRepo.createToken({
      id: uuidv4(),
      user_email_id: userEmail.id,
      token_hash: createTokenHash(token),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      ip,
      user_agent,
      created_at: new Date(),
    });

    await this.emailService.sendEmail({
      to: userEmail.email,
      subject: "Verify your StudyHub account",
      html: `<p>Hello ${userEmail.user_name || ""},</p>
           <p>Please verify your email by clicking the link below:</p>
           <a href="${
             process.env.FRONTEND_URL
           }/auth/verify-email?token=${token}">Verify Email</a>
           <p>This link will expire in 24 hours.</p>`,
      from: "StudyHub <no-reply@studyhub.com>",
    }).catch((err) => {
      console.warn(`[AuthService] Failed to send verification email: ${err.message}`);
    });

    return token;
  }

  /**
   * Register a new user and send verification email
   * @param {Object} payload
   * @param {string} payload.user_name
   * @param {string} payload.email
   * @param {string} payload.password
   * @param {string} [payload.user_agent]
   * @param {string} [payload.ip]
   * @returns {Promise<{user:Object, verification_token:string}>}
   */
  async register({
    user_name,
    email,
    password,
    display_name,
    user_agent = null,
    ip = null,
  }) {
    if (!user_name || !email || !password || !display_name)
      throw new Error(
        "Username, email, display name and password are required"
      );

    const existingUser = await this.userRepo.findByUserName(user_name);
    if (existingUser) throw new Error("Username already exists");

    const existingEmail = await this.userEmailRepo.findByEmail(email);
    if (existingEmail) throw new Error("Email already exists");

    const hashed_password = await bcrypt.hash(password, this.SALT_ROUNDS);

    const newUser = await this.userRepo.create({
      id: uuidv4(),
      user_name,
      password_hash: hashed_password,
      status: "active",
      created_at: new Date(),
    });

    const userEmail = await this.userEmailRepo.create({
      id: uuidv4(),
      user_id: newUser.id,
      email,
      type: "primary",
      is_verified: 0,
      created_at: new Date(),
    });

    let verificationToken = null;
    try {
      verificationToken = await this.sendVerificationEmail(
        { ...userEmail, user_name: newUser.user_name },
        user_agent,
        ip
      );
    } catch (err) {
      console.warn(`[AuthService] Verification email failed, auto-verifying: ${err.message}`);
      await this.userEmailRepo.updateById(userEmail.id, { is_verified: 1 });
    }

    const defaultRole = await this.roleRepo.findByName("user");
    if (defaultRole) {
      await this.userRoleRepo.assignRole({
        id: uuidv4(),
        user_id: newUser.id,
        role_id: defaultRole.id,
        assigned_at: new Date(),
      });
    }

    await this.auditRepo.logAction({
      id: uuidv4(),
      actor_user_id: newUser.id,
      action: "REGISTER",
      created_at: new Date(),
    });

    await this.outboxRepo.insertEvent(
      "user.created",
      {
        id: newUser.id,
        user_name,
        email,
        display_name,
        created_at: newUser.created_at,
      },
      {
        aggregate_type: "User",
        aggregate_id: newUser.id,
        routing_key: "user.created",
      }
    );

    console.log("[OUTBOX] user.created event inserted");

    // Direct sync to user service (fallback for when RabbitMQ is not configured)
    if (env.USER_SERVICE_URL) {
      const syncUser = {
        id: newUser.id,
        display_name,
        user_name,
        email,
        created_at: newUser.created_at,
      };
      const syncPayload = JSON.stringify(syncUser);
      const syncReq = https.request(`${env.USER_SERVICE_URL}/api/v1/user/profile/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      }, (syncRes) => {
        let body = "";
        syncRes.on("data", (c) => body += c);
        syncRes.on("end", () => {
          if (syncRes.statusCode >= 200 && syncRes.statusCode < 300) {
            console.log("[AuthService] User synced to user service");
          } else {
            console.warn(`[AuthService] User sync returned ${syncRes.statusCode}: ${body}`);
          }
        });
      });
      syncReq.on("error", (err) => {
        console.warn(`[AuthService] User sync failed: ${err.message}`);
      });
      syncReq.write(syncPayload);
      syncReq.end();
    }

    return { user: newUser, verification_token: verificationToken };
  }

  /**
   * Verify email token
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async verifyEmail(token) {
    if (!token) throw new Error("Token required");

    const token_hash = createTokenHash(token);
    const verification = await this.emailVerificationRepo.findByHash(
      token_hash
    );
    if (!verification) throw new Error("Invalid token");
    if (verification.used_at) throw new Error("Token already used");
    if (new Date() > verification.expires_at) throw new Error("Token expired");

    await this.userEmailRepo.updateById(verification.user_email_id, {
      is_verified: 1,
    });
    await this.emailVerificationRepo.markUsed(verification.id);

    const userEmail = await this.userEmailRepo.findById(
      verification.user_email_id
    );
    await this.auditRepo.logAction({
      id: uuidv4(),
      actor_user_id: userEmail.user_id,
      action: "EMAIL_VERIFIED",
      created_at: new Date(),
    });

    return true;
  }

  /**
   * Login user using email or username
   * @param {Object} payload
   * @param {string} [payload.email]
   * @param {string} [payload.user_name]
   * @param {string} payload.password
   * @param {string} [payload.user_agent]
   * @param {string} [payload.ip]
   * @returns {Promise<{user:Object, access_token:string, refresh_token:string}>}
   */
  async login({ email, user_name, password, user_agent = null, ip = null }) {
    if ((!email && !user_name) || !password)
      throw new Error("Email or username and password required");

    let user;
    let emailRow;

    // ======== FIND USER BY EMAIL ========
    if (email) {
      emailRow = await this.userEmailRepo.findByEmail(email);
      if (!emailRow) throw new Error("Email not found");

      if (emailRow.is_verified === 0) {
        try {
          await this.sendVerificationEmail(
            { ...emailRow, user_name: user_name },
            user_agent,
            ip
          );
        } catch (err) {
          console.warn(`[AuthService] Verification email failed, auto-verifying: ${err.message}`);
          await this.userEmailRepo.updateById(emailRow.id, { is_verified: 1 });
          emailRow.is_verified = 1;
        }
        if (emailRow.is_verified === 0) {
          throw new Error(
            "Email not verified. A new verification email has been sent."
          );
        }
      }

      user = await this.userRepo.findById(emailRow.user_id);
      if (!user) throw new Error("User associated with email not found");
    }

    // ======== FIND USER BY USERNAME ========
    else {
      user = await this.userRepo.findByUserName(user_name);
      if (!user) throw new Error("Username not found");

      const emails = await this.userEmailRepo.getUserEmails(user.id);
      emailRow = emails.find((e) => e.is_verified === 1);

      if (!emailRow) {
        const primaryEmail = emails[0];
        try {
          await this.sendVerificationEmail(
            { ...primaryEmail, user_name: user.user_name },
            user_agent,
            ip
          );
        } catch (err) {
          console.warn(`[AuthService] Verification email failed, auto-verifying: ${err.message}`);
          if (primaryEmail) {
            await this.userEmailRepo.updateById(primaryEmail.id, { is_verified: 1 });
            emailRow = primaryEmail;
            emailRow.is_verified = 1;
          }
        }
        if (!emailRow) {
          throw new Error(
            "No verified email found. A verification email has been sent to your primary email."
          );
        }
      }
    }

    // ======== PASSWORD VALIDATION ========
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) throw new Error("Password incorrect");

    await this.userRepo.updateById(user.id, {
      last_login_at: new Date(),
    });
    // ======== GET USER ROLES ========
    const roleAssignments = await this.userRoleRepo.findByUserId(user.id);
    const roleNames = [];
    for (const ra of roleAssignments) {
      const role = await this.roleRepo.findById(ra.role_id);
      if (role) roleNames.push(role.name);
    }

    // ======== GENERATE TOKENS ========
    const access_token = signAccessToken({
      id: user.id,
      name: user.user_name,
      role: roleNames,
      primary_email: emailRow.email,
    });
    const refresh_token = signRefreshToken({ id: user.id });

    // ======== STORE SESSION ========
    await this.sessionRepo.create({
      id: uuidv4(),
      user_id: user.id,
      refresh_token_hash: createTokenHash(refresh_token),
      created_at: new Date(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ip,
      user_agent,
    });

    // ======== LOG LOGIN EVENT ========
    await this.auditRepo.logAction({
      id: uuidv4(),
      actor_user_id: user.id,
      action: "LOGIN",
      created_at: new Date(),
    });

    // ======== FINAL RETURN ========
    return {
      user: {
        id: user.id,
        user_name: user.user_name,
        role: roleNames.length === 1 ? roleNames[0] : roleNames,
        primary_email: emailRow.email,
      },
      access_token,
      refresh_token,
    };
  }

  /**
   * Refresh access token
   * @param {string} refresh_token
   * @returns {Promise<{access_token:string}>}
   */
  async refreshToken(refresh_token) {
    if (!refresh_token) throw new Error("Refresh token required");

    const token_hash = createTokenHash(refresh_token);
    const session = await this.sessionRepo.findByRefreshTokenHash(token_hash);
    if (!session) throw new Error("Invalid refresh token");
    if (session.revoked_at) throw new Error("Refresh token revoked");

    const user = await this.userRepo.findById(session.user_id);
    if (!user) throw new Error("User not found");

    const access_token = signAccessToken({ id: user.id, name: user.user_name });
    await this.auditRepo.logAction({
      id: uuidv4(),
      actor_user_id: user.id,
      action: "REFRESH_TOKEN",
      created_at: new Date(),
    });

    return { access_token };
  }

  /**
   * Change user password
   * @param {string} user_id
   * @param {string} old_password
   * @param {string} new_password
   * @returns {Promise<boolean>}
   */
  async changePassword(user_id, old_password, new_password) {
    if (!user_id || !old_password || !new_password)
      throw new Error("Missing parameters");

    const user = await this.userRepo.findById(user_id);
    if (!user) throw new Error("User not found");

    const match = await bcrypt.compare(old_password, user.password_hash);
    if (!match) throw new Error("Old password incorrect");

    const hashed = await bcrypt.hash(new_password, this.SALT_ROUNDS);
    await this.userRepo.updateById(user_id, { password_hash: hashed });
    await this.auditRepo.logAction({
      id: uuidv4(),
      actor_user_id: user_id,
      action: "CHANGE_PASSWORD",
      created_at: new Date(),
    });

    return true;
  }

  /**
   * Request password reset token
   * @param {string} email
   * @param {string} [user_agent]
   * @param {string} [ip]
   * @returns {Promise<string|null>} Password reset token
   */
  async forgotPassword(email, user_agent = null, ip = null) {
    if (!email) throw new Error("Email required");

    const emailRow = await this.userEmailRepo.findByEmail(email);
    if (!emailRow) return null;

    const token = crypto.randomBytes(32).toString("hex");
    await this.passwordResetRepo.create({
      id: uuidv4(),
      user_id: emailRow.user_id,
      token_hash: createTokenHash(token),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      ip,
      user_agent,
      created_at: new Date(),
    });

    await this.emailService.sendEmail({
      to: email,
      subject: "Reset your StudyHub password",
      html: `<p>Hello,</p>
             <p>You requested a password reset. Click the link below:</p>
             <a href="${process.env.FRONTEND_URL}/reset-password?token=${token}">Reset Password</a>
             <p>This link will expire in 1 hour.</p>`,
      from: "StudyHub <no-reply@studyhub.com>",
    });

    await this.auditRepo.logAction({
      id: uuidv4(),
      actor_user_id: emailRow.user_id,
      action: "FORGOT_PASSWORD_REQUEST",
      created_at: new Date(),
    });

    return token;
  }

  /**
   * Reset password using token
   * @param {string} token
   * @param {string} new_password
   * @returns {Promise<boolean>}
   */
  async resetPassword(token, new_password) {
    if (!token || !new_password) throw new Error("Missing parameters");

    const token_hash = createTokenHash(token);
    const resetRow = await this.passwordResetRepo.findByHash(token_hash);
    if (!resetRow || resetRow.used_at) throw new Error("Invalid or used token");

    const hashed = await bcrypt.hash(new_password, this.SALT_ROUNDS);
    await this.userRepo.updateById(resetRow.user_id, { password_hash: hashed });
    await this.passwordResetRepo.markUsed(resetRow.id);
    await this.auditRepo.logAction({
      id: uuidv4(),
      actor_user_id: resetRow.user_id,
      action: "RESET_PASSWORD",
      created_at: new Date(),
    });

    return true;
  }

  /**
   * Logout user by revoking refresh token
   * @param {string} refresh_token
   * @returns {Promise<boolean>}
   */
  async logout(refresh_token) {
    const refresh_token_hash = createTokenHash(refresh_token);
    const session = await this.sessionRepo.findByRefreshTokenHash(
      refresh_token_hash
    );
    if (!session) {
      throw new Error("Invalid refresh token");
    }
    await this.sessionRepo.revokeSession(session.id);
    return true;
  }

  /**
   * Get current user by ID
   * @param {string} user_id
   * @returns {Promise<Object>}
   */
  async getMe(user_id) {
    return this.userRepo.findById(user_id);
  }
}
