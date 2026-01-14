import { Hono } from 'hono'
import { AppEnv } from '../middleware/db'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getUserProfile, updateUserProfile } from '../features/user/profile'
import { addSnsLink, deleteSnsLink} from '../features/user/snsurl'

export const meApp = new Hono<AppEnv>()

//認証
meApp.use('/*', (c,next)=>{
  const jwtMiddleware = jwt({secret: c.env.JWT_SECRET,})
  return jwtMiddleware(c,next)
})

//プロフィールの表示
meApp.get('/me',  async (c) => {
    const currentUserId = c.get('jwtPayload').sub as string
    const result = await getUserProfile(c.env.DB, currentUserId, currentUserId)

    if(!result) {
      return c.json({ error: 'User not found'}, 404)
    }
    return c.json({ user: result })
  }
)

// 他人のプロフィール表示
meApp.get("/users/:id", async (c) => {
  const targetId = c.req.param("id");
  const currentUserId = c.get("jwtPayload")?.sub;
  
  const profile = await getUserProfile(c.env.DB, targetId, currentUserId);
  
  if (!profile) return c.json({ error: "Not Found" }, 404);
  return c.json(profile);
});

//バリデーション用スキーマ
const updateProfileSchema = z.object({
  username: z.string().max(50).optional(),
  displayName: z.string().max(50).optional(),
  description: z.string().max(200).optional(),
  iconUrl: z.string().optional(),
})

//プロフィールの登録・編集
meApp.patch('/me',zValidator('json', updateProfileSchema), async (c)=> {
  const payload = c.get('jwtPayload')
  const userId = payload.sub 
  const data = c.req.valid('json')

  try{
    const result = await updateUserProfile(c.env.DB, userId, data)
    return c.json({ user: result })

  }catch(e){
    console.error(e)
    return c.json({ error: 'Failed to update profile' }, 500)
  }
})

const snsSchema = z.object({
  url: z.url(),
})

//snsの追加
meApp.post('/me/sns',zValidator('json',snsSchema), async (c) => {
  const payload = c.get('jwtPayload')
  const userId = payload.sub
  const {url} = c.req.valid('json')

  try {
    const result = await addSnsLink(c.env.DB, userId, url)
    return c.json(result, 201)
  }catch(e){
    console.error(e)
    return c.json({ error: 'Failed to add SNS' }, 500)
  }
})

const paramSchema = z.object({
  id: z.string().uuid()// 消したいSNSリンクのID
})

// URLの後ろにIDをつけて指定する (/sns/123-abc)
meApp.delete('/sns/:id', zValidator('param', paramSchema), async (c) => {
  const payload = c.get('jwtPayload')
  const { id } = c.req.valid('param')

  try {
    const result = await deleteSnsLink(c.env.DB, payload.sub as string, id)
    
    if (!result) {
      return c.json({ error: 'Link not found or not authorized' }, 404)
    }

    return c.json({ message: 'Deleted', deleted: result })
  } catch (e) {
    console.error(e)
    return c.json({ error: 'Failed to delete SNS' }, 500)
  }
})

export default meApp