import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  StatusCodes,
  getReasonPhrase,
} from 'http-status-codes'
import { IDrugInsert, IDrugMapping, IDrugUpdate } from "../../@types/drug"
import { DrugModel } from "../models/drug"

const fs = require('fs')
const csv = require('csv-parser')

const { DateTime } = require('luxon')

import mappingSchema from '../schema/drug/mapping'
import deleteSchema from '../schema/drug/delete'
import updateSchema from '../schema/drug/update'


export default async (fastify: FastifyInstance) => {

  const db = fastify.db
  const drugModel = new DrugModel()

  fastify.get('/drugs/list', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const _query: any = request.query
      const { limit, offset, query } = _query
      const _limit = limit || 20
      const _offset = offset || 0

      const hospcode = request.user.hospcode

      const results: any = await drugModel.list(db, hospcode, query, _limit, _offset)
      reply.status(StatusCodes.OK).send(results)
    } catch (e) {
      reply.status(StatusCodes.INTERNAL_SERVER_ERROR).send()
    }
  })

  fastify.post('/drugs/upload', {
    onRequest: [fastify.authenticate],
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {

      const userId: any = request.user.sub
      const hospcode: any = request.user.hospcode

      const now = DateTime.now().setZone('Asia/Bangkok');

      const files = await request.saveRequestFiles({ limits: { fileSize: 17000 } })

      for (const file of files) {
        if (file.mimetype !== 'text/csv') {
          return reply.status(StatusCodes.BAD_REQUEST)
            .send({ error: 'Invalid file type' });
        }
      }

      const filepath = files[0].filepath
      let results: IDrugInsert[] = [];

      const stream = fs.createReadStream(filepath)
        .pipe(csv())

      const expectedHeader = ['code', 'name']
      let headerChecked = false

      for await (const data of stream) {
        if (!headerChecked) {
          const header = Object.keys(data);
          if (!expectedHeader.every((h) => header.includes(h))) {
            const errorMessage = `ERROR: The header of the CSV file is invalid. Expected: ${expectedHeader.join(', ')}. Found: ${header.join(', ')}.`
            console.error(errorMessage)

            return reply
              .status(StatusCodes.INTERNAL_SERVER_ERROR)
              .send({
                code: StatusCodes.INTERNAL_SERVER_ERROR,
                error: errorMessage
              })
          }
          headerChecked = true
        }
        results.push({
          hospcode,
          name: data.name,
          code: data.code,
          user_id: userId,
          updated_at: now,
        })
      }

      // Import
      await drugModel.bulkInsert(db, results)

      reply.status(StatusCodes.OK)
        .send(getReasonPhrase(StatusCodes.OK))

    } catch (error: any) {
      request.log.error(error)
      reply
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send({
          code: StatusCodes.INTERNAL_SERVER_ERROR,
          error: getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR)
        })
    }
  })

  // Remove drug
  fastify.delete('/drugs/:code/delete', {
    onRequest: [fastify.authenticate],
    schema: deleteSchema,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const hospcode = request.user.hospcode
      // const userId = request.user.sub

      const params: any = request.params
      const { code } = params
      await drugModel.remove(db, code, hospcode)
      reply.status(StatusCodes.OK).send(getReasonPhrase(StatusCodes.OK))
    } catch (error: any) {
      request.log.error(error)
      reply.status(StatusCodes.INTERNAL_SERVER_ERROR).send()
    }
  })

  // Save mapping
  fastify.post('/drugs/mapping', {
    onRequest: [fastify.authenticate],
    schema: mappingSchema,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const hospcode = request.user.hospcode
      const userId = request.user.sub

      const body: any = request.body
      const { code, f43, nhso, tmt } = body

      const now = DateTime.now().setZone('Asia/Bangkok');

      const data: IDrugMapping = {
        code,
        f43,
        nhso,
        tmt,
        user_id: userId,
        hospcode,
        updated_at: now
      }

      await drugModel.mapping(db, data)
      reply.status(StatusCodes.OK).send(getReasonPhrase(StatusCodes.OK))
    } catch (error: any) {
      request.log.error(error)
      reply.status(StatusCodes.INTERNAL_SERVER_ERROR).send()
    }
  })

  // Update info
  fastify.put('/drugs/:code/update', {
    onRequest: [fastify.authenticate],
    schema: updateSchema,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const hospcode = request.user.hospcode
      const userId = request.user.sub

      const params: any = request.params
      const { code } = params

      const body: any = request.body
      const { name } = body

      const now = DateTime.now().setZone('Asia/Bangkok');

      const data: IDrugUpdate = {
        name,
        user_id: userId,
        updated_at: now
      }

      await drugModel.update(db, hospcode, code, data)
      reply.status(StatusCodes.OK).send(getReasonPhrase(StatusCodes.OK))
    } catch (error: any) {
      request.log.error(error)
      reply.status(StatusCodes.INTERNAL_SERVER_ERROR).send()
    }
  })

} 
