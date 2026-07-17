export class DocumentController {
  constructor({ documentService }) {
    this.documentService = documentService;
  }

  // =====================================================
  // CREATE
  // =====================================================
  async createDocument(req, res) {
    try {
      const { title, description, visibility, tags, group_id } = req.body;
      const owner_id = req.user.id;

      if (!req.file) {
        return res.status(400).json({ error: "file_missing" });
      }

      const result = await this.documentService.createDocument({
        owner_id,
        title,
        description,
        visibility,
        tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
        group_id,
        file: req.file,
      });

      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // =====================================================
  // ADMIN counts
  // =====================================================
  async countDocuments(req, res) {
    try {
      const counts = await this.documentService.countDocuments();
      return res.json(counts);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async countComments(req, res) {
    try {
      const counts = await this.documentService.countComments();
      return res.json(counts);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getCommentsByDocument(req, res) {
    try {
      const { limit = 50, offset = 0 } = req.query;

      const comments = await this.documentService.getCommentsByDocument(
        req.params.id,
        {
          limit: Number(limit),
          offset: Number(offset),
        }
      );

      return res.json(comments);
    } catch (err) {
      return res.status(403).json({ error: err.message });
    }
  }

  async getAllComments(req, res) {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;

      const result = await this.documentService.getAllComments({
        limit,
        offset,
      });

      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // =====================================================
  // FEEDS
  // =====================================================
  async getPublicFeed(req, res) {
    try {
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;

      const docs = await this.documentService.getPublicFeed({
        limit,
        offset,
      });

      return res.json(docs);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getHomeFeed(req, res) {
    try {
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;

      const user_id = req.user?.id || null;
      const token = req.headers.authorization?.split(" ")[1] || null;

      const docs = await this.documentService.getHomeFeed(user_id, token, {
        limit,
        offset,
      });

      return res.json(docs);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getMyDocuments(req, res) {
    try {
      const docs = await this.documentService.getMyDocuments(req.user.id);
      return res.json(docs);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // =====================================================
  // GET DOCUMENT DETAIL
  // =====================================================
  async getDocument(req, res) {
    try {
      const user = req.user;
      const isAdmin = Array.isArray(user?.role)
        ? user.role.includes("admin")
        : user?.role === "admin";
      const doc = await this.documentService.getDocumentDetail(
        req.params.id,
        user?.id,
        isAdmin
      );

      return res.json(doc);
    } catch (err) {
      return res.status(403).json({ error: err.message });
    }
  }

  // =====================================================
  // GET DOCUMENT PREVIEW URL
  // =====================================================
  async getDocumentPreviewUrl(req, res) {
    try {
      const user = req.user;
      const isAdmin = Array.isArray(user?.role)
        ? user.role.includes("admin")
        : user?.role === "admin";

      const preview = await this.documentService.getDocumentPreview(
        req.params.id,
        user?.id,
        isAdmin
      );

      return res.json(preview);
    } catch (err) {
      console.error("Error fetching document preview:", err);
      return res.status(403).json({ error: err.message });
    }
  }

  // =====================================================
  // USER PUBLIC PROFILE DOCUMENTS
  // =====================================================
  async getUserPublicDocuments(req, res) {
    try {
      const docs = await this.documentService.getUserPublicProfileDocuments(
        req.params.user_id
      );

      return res.json(docs);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // =====================================================
  // GROUP
  // =====================================================
  async getApprovedDocuments(req, res) {
    try {
      const docs = await this.documentService.getApprovedDocuments();
      return res.json(docs);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getGroupApproved(req, res) {
    try {
      const docs = await this.documentService.getGroupApproved(
        req.params.group_id,
        req.user.id
      );
      return res.json(docs);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getGroupPending(req, res) {
    try {
      const docs = await this.documentService.getGroupPending(
        req.params.group_id,
        req.user.id
      );
      return res.json(docs);
    } catch (err) {
      return res.status(403).json({ error: err.message });
    }
  }

  // =====================================================
  // UPDATE
  // =====================================================
  async updateDocument(req, res) {
    try {
      const updated = await this.documentService.updateDocument(
        req.params.id,
        req.user.id,
        req.body
      );

      return res.json(updated);
    } catch (err) {
      return res.status(403).json({ error: err.message });
    }
  }

  // =====================================================
  // DELETE
  // =====================================================
  async deleteDocument(req, res) {
    try {
      await this.documentService.deleteDocument(req.params.id, req.user.id);
      return res.json({ deleted: true });
    } catch (err) {
      return res.status(403).json({ error: err.message });
    }
  }

  // =====================================================
  // SEARCH
  // =====================================================
  async search(req, res) {
    try {
      const queryStr = (req.query.query || "").trim();
      const limit = Math.max(Number(req.query.limit) || 10, 1);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      if (!queryStr) return res.json([]);

      const results = await this.documentService.searchDocuments(
        queryStr,
        req.user?.id,
        { limit, offset }
      );

      return res.json(results);
    } catch (err) {
      console.error("Search error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
  
  // =====================================================
  // TAGS
  // =====================================================
  async getAllTags(req, res) {
    try {
      const tags = await this.documentService.getAllTags();
      return res.json(tags);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
