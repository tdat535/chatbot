const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CRM Mini API',
      version: '1.0.0',
      description: 'API tích hợp đa kênh — Trường Cao đẳng Viễn Đông',
    },
    servers: [{ url: 'http://localhost:3001', description: 'Local' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Conversation: {
          type: 'object',
          properties: {
            id:               { type: 'integer' },
            channel:          { type: 'string', enum: ['facebook', 'zalo', 'website'] },
            status:           { type: 'string', enum: ['open', 'closed'] },
            last_message:     { type: 'string' },
            last_message_at:  { type: 'string', format: 'date-time' },
            unread_count:     { type: 'integer' },
            labels:           { type: 'array', items: { type: 'string' } },
            assigned_to:      { type: 'integer', nullable: true },
            assigned_name:    { type: 'string', nullable: true },
            customer_name:    { type: 'string' },
            customer_phone:   { type: 'string', nullable: true },
            customer_email:   { type: 'string', nullable: true },
            channel_user_id:  { type: 'string' },
            avatar_url:       { type: 'string', nullable: true },
          },
        },
        Message: {
          type: 'object',
          properties: {
            id:              { type: 'integer' },
            conversation_id: { type: 'integer' },
            content:         { type: 'string' },
            direction:       { type: 'string', enum: ['in', 'out'] },
            sent_by:         { type: 'string', enum: ['user', 'agent', 'bot'] },
            sender_name:     { type: 'string', nullable: true },
            created_at:      { type: 'string', format: 'date-time' },
          },
        },
        Customer: {
          type: 'object',
          properties: {
            id:              { type: 'integer' },
            name:            { type: 'string' },
            phone:           { type: 'string', nullable: true },
            email:           { type: 'string', nullable: true },
            channel:         { type: 'string' },
            channel_user_id: { type: 'string' },
            tags:            { type: 'array', items: { type: 'string' } },
            notes:           { type: 'string', nullable: true },
            avatar_url:      { type: 'string', nullable: true },
          },
        },
        Template: {
          type: 'object',
          properties: {
            id:      { type: 'integer' },
            name:    { type: 'string' },
            content: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id:           { type: 'integer' },
            username:     { type: 'string' },
            display_name: { type: 'string' },
            role:         { type: 'string', enum: ['admin', 'agent'] },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth',          description: 'Xác thực' },
      { name: 'Conversations', description: 'Quản lý hội thoại' },
      { name: 'Customers',     description: 'Quản lý khách hàng' },
      { name: 'Templates',     description: 'Mẫu tin nhắn' },
      { name: 'Broadcast',     description: 'Gửi hàng loạt' },
      { name: 'Users',         description: 'Quản lý nhân viên' },
      { name: 'Stats',         description: 'Thống kê' },
      { name: 'Webhooks',      description: 'Nhận tin nhắn từ Facebook / Zalo' },
    ],
    paths: {
      // ── AUTH ──────────────────────────────────────────────
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Đăng nhập',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string', example: 'admin' },
                    password: { type: 'string', example: '123456' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Đăng nhập thành công',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user:  { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            401: { description: 'Sai tài khoản hoặc mật khẩu' },
          },
        },
      },

      // ── CONVERSATIONS ─────────────────────────────────────
      '/api/conversations': {
        get: {
          tags: ['Conversations'],
          summary: 'Danh sách hội thoại',
          parameters: [
            { name: 'channel', in: 'query', schema: { type: 'string', enum: ['all', 'facebook', 'zalo', 'website'] } },
            { name: 'status',  in: 'query', schema: { type: 'string', enum: ['all', 'open', 'closed'] } },
            { name: 'search',  in: 'query', schema: { type: 'string' }, description: 'Tìm theo tên, SĐT, tin nhắn' },
            { name: 'label',   in: 'query', schema: { type: 'string', enum: ['chua-tu-van', 'dang-tu-van', 'da-tu-van'] } },
            { name: 'assigned_to', in: 'query', schema: { type: 'integer' }, description: 'ID nhân viên phụ trách' },
          ],
          responses: {
            200: {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Conversation' } } } },
            },
          },
        },
      },

      '/api/conversations/stats': {
        get: {
          tags: ['Conversations'],
          summary: 'Thống kê hội thoại',
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      total:     { type: 'integer' },
                      open:      { type: 'integer' },
                      unread:    { type: 'integer' },
                      byChannel: { type: 'array', items: { type: 'object', properties: { channel: { type: 'string' }, count: { type: 'integer' } } } },
                    },
                  },
                },
              },
            },
          },
        },
      },

      '/api/conversations/{id}': {
        get: {
          tags: ['Conversations'],
          summary: 'Chi tiết hội thoại',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Conversation' } } } },
            404: { description: 'Không tìm thấy' },
          },
        },
        put: {
          tags: ['Conversations'],
          summary: 'Cập nhật hội thoại',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status:      { type: 'string', enum: ['open', 'closed'] },
                    labels:      { type: 'array', items: { type: 'string' } },
                    assigned_to: { type: 'integer', nullable: true },
                    auto_reply:  { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Cập nhật thành công' },
          },
        },
      },

      '/api/conversations/{id}/messages': {
        get: {
          tags: ['Conversations'],
          summary: 'Lấy tin nhắn trong hội thoại',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Message' } } } },
            },
          },
        },
        post: {
          tags: ['Conversations'],
          summary: 'Gửi tin nhắn',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content'],
                  properties: {
                    content:     { type: 'string', example: 'Xin chào!' },
                    sender_name: { type: 'string', example: 'Nguyễn Tư Vấn' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } } },
          },
        },
      },

      '/api/conversations/{id}/notes': {
        post: {
          tags: ['Conversations'],
          summary: 'Ghi chú nội bộ (không gửi ra khách)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content'],
                  properties: {
                    content:     { type: 'string' },
                    sender_name: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'OK' },
          },
        },
      },

      '/api/conversations/{id}/export': {
        get: {
          tags: ['Conversations'],
          summary: 'Xuất lịch sử hội thoại ra CSV',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'File CSV (UTF-8 BOM)', content: { 'text/csv': {} } },
          },
        },
      },

      // ── CUSTOMERS ─────────────────────────────────────────
      '/api/customers': {
        get: {
          tags: ['Customers'],
          summary: 'Danh sách khách hàng',
          parameters: [
            { name: 'search',  in: 'query', schema: { type: 'string' } },
            { name: 'channel', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Customer' } } } } },
          },
        },
      },

      '/api/customers/{id}': {
        put: {
          tags: ['Customers'],
          summary: 'Cập nhật thông tin khách hàng',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name:  { type: 'string' },
                    phone: { type: 'string' },
                    email: { type: 'string' },
                    tags:  { type: 'array', items: { type: 'string' } },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'OK' } },
        },
      },

      // ── TEMPLATES ─────────────────────────────────────────
      '/api/templates': {
        get: {
          tags: ['Templates'],
          summary: 'Danh sách mẫu tin nhắn',
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Template' } } } } },
          },
        },
        post: {
          tags: ['Templates'],
          summary: 'Tạo mẫu tin nhắn',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'content'],
                  properties: {
                    name:    { type: 'string', example: 'Chào hỏi' },
                    content: { type: 'string', example: 'Xin chào! Mình có thể giúp gì?' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'OK' } },
        },
      },

      '/api/templates/{id}': {
        put: {
          tags: ['Templates'],
          summary: 'Cập nhật mẫu',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } } },
              },
            },
          },
          responses: { 200: { description: 'OK' } },
        },
        delete: {
          tags: ['Templates'],
          summary: 'Xoá mẫu',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: 'OK' } },
        },
      },

      // ── BROADCAST ─────────────────────────────────────────
      '/api/broadcast': {
        post: {
          tags: ['Broadcast'],
          summary: 'Gửi tin nhắn hàng loạt',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message', 'conversation_ids'],
                  properties: {
                    message:          { type: 'string', example: 'Tuyển sinh 2026 đã mở!' },
                    conversation_ids: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3] },
                    sender_name:      { type: 'string', example: 'Phòng Tuyển Sinh' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      total:   { type: 'integer' },
                      success: { type: 'integer' },
                      failed:  { type: 'integer' },
                      details: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ── USERS ─────────────────────────────────────────────
      '/api/users': {
        get: {
          tags: ['Users'],
          summary: 'Danh sách nhân viên',
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } },
          },
        },
        post: {
          tags: ['Users'],
          summary: 'Tạo tài khoản nhân viên',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password', 'display_name'],
                  properties: {
                    username:     { type: 'string' },
                    password:     { type: 'string' },
                    display_name: { type: 'string' },
                    role:         { type: 'string', enum: ['admin', 'agent'], default: 'agent' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'OK' } },
        },
      },

      '/api/users/{id}': {
        delete: {
          tags: ['Users'],
          summary: 'Xoá tài khoản',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: 'OK' } },
        },
      },

      '/api/users/{id}/password': {
        put: {
          tags: ['Users'],
          summary: 'Đổi mật khẩu',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['password'],
                  properties: { password: { type: 'string' } },
                },
              },
            },
          },
          responses: { 200: { description: 'OK' } },
        },
      },

      // ── STATS ─────────────────────────────────────────────
      '/api/stats': {
        get: {
          tags: ['Stats'],
          summary: 'Thống kê tổng hợp dashboard',
          responses: { 200: { description: 'OK' } },
        },
      },

      // ── WEBHOOKS ──────────────────────────────────────────
      '/webhook/facebook': {
        get: {
          tags: ['Webhooks'],
          summary: 'Xác minh webhook Facebook',
          security: [],
          parameters: [
            { name: 'hub.mode',         in: 'query', schema: { type: 'string' } },
            { name: 'hub.verify_token', in: 'query', schema: { type: 'string' } },
            { name: 'hub.challenge',    in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Trả về hub.challenge' }, 403: { description: 'Token không khớp' } },
        },
        post: {
          tags: ['Webhooks'],
          summary: 'Nhận tin nhắn từ Facebook Messenger',
          security: [],
          responses: { 200: { description: 'OK' } },
        },
      },

      '/webhook/zalo': {
        post: {
          tags: ['Webhooks'],
          summary: 'Nhận tin nhắn từ Zalo OA',
          security: [],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    event_name: { type: 'string', example: 'user_send_text' },
                    sender: {
                      type: 'object',
                      properties: {
                        id:           { type: 'string' },
                        display_name: { type: 'string' },
                        avatar:       { type: 'string' },
                      },
                    },
                    message: {
                      type: 'object',
                      properties: { text: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  },
  apis: [],
};

module.exports = swaggerJsdoc(options);
