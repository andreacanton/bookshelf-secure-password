'use strict'

const Bookshelf = require('bookshelf')
const expect = require('chai').expect
const Knex = require('knex')
const mockKnex = require('mock-knex')
const PasswordMismatchError = require('../lib/error')
const securePassword = require('../lib/secure-password.js')

describe('bookshelf-secure-password', function () {
  let bookshelf
  let knex

  before(function () {
    knex = new Knex({
      client: 'pg'
    })
    mockKnex.mock(knex)
  })

  after(function () {
    mockKnex.unmock(knex)
  })

  describe('synchronous behavior', function () {
    before(function () {
      bookshelf = new Bookshelf(knex)
      bookshelf.plugin(securePassword)
    })

    describe('with the default column', function () {
      let model

      before(function () {
        const Model = bookshelf.Model.extend({
          hasSecurePassword: true
        })

        model = new Model({ password: 'testing' })
      })

      it('does not keep the raw password on the model', function () {
        expect(model.get('password')).to.be.undefined
        expect(model.attributes.password).to.be.undefined

        expect(model.get('password_digest')).to.be.a.string
        expect(model.attributes.password_digest).to.be.a.string
      })

      it('sets the password digest field to null if given a `null` value', function () {
        expect(model.get('password_digest')).to.be.a.string
        model.set('password', null)
        expect(model.get('password_digest')).to.be.null
      })

      it('does not change the password digest if given undefined', function () {
        let originalString = model.get('password_digest')
        model.set('password', undefined)
        expect(model.get('password_digest')).to.equal(originalString)
      })

      it('does not change the password digest if given an empty string', function () {
        let originalString = model.get('password_digest')
        model.set('password', '')
        expect(model.get('password_digest')).to.equal(originalString)
      })

      it('changes the password digest if given a blank (spaces-only) string', function () {
        let originalString = model.get('password_digest')
        model.set('password', '  ')
        expect(model.get('password_digest')).to.be.a.string
        expect(model.get('password_digest')).not.to.equal(originalString)
      })
    })

    it('allows the default column to be overwritten', function () {
      const Model = bookshelf.Model.extend({
        hasSecurePassword: 'custom_column'
      })

      let model = new Model({ password: 'testing' })
      expect(model.get('password')).to.be.undefined
      expect(model.attributes.password).to.be.undefined

      expect(model.get('custom_column')).to.be.a.string
      expect(model.attributes.custom_column).to.be.a.string
    })
  })

  describe('asynchronous save-time behavior', function () {
    let model

    before(function () {
      bookshelf = new Bookshelf(knex)
      bookshelf.plugin(securePassword, {
        performOnSave: true
      })

      const Model = bookshelf.Model.extend({
        hasSecurePassword: true
      })

      model = new Model({ id: 1, password: 'testing' })

      expect(model.get('password')).to.equal('testing')
      expect(model.get('password_digest')).to.be.undefined
    })

    it('saves the hashed password, clearing the raw password field', function () {
      return model.save().then((model) => {
        expect(model.get('password')).to.be.undefined
        expect(model.get('password_digest')).to.be.a.string
      })
    })

    it('handles the case if a later validation throws an exception', function () {
      let digest

      model.on('saving', function (model) {
        throw new Error()
      })

      return model
        .save()
        .then(() => {
          expect(false).to.be.true
        }, () => {
          expect(model.get('password')).to.be.undefined
          expect(model.get('password_digest')).to.be.a.string
          digest = model.get('password_digest')
          return model.save()
        })
        .then(() => {
          expect(false).to.be.true
        }, () => {
          expect(model.get('password_digest')).to.equal(digest)
        })
    })
  })

  describe('#authenticate', function () {
    let model

    describe('synchronous behavior', function () {
      before(function () {
        bookshelf = new Bookshelf(knex)
        bookshelf.plugin(securePassword)
      })

      describe('with hasSecurePassword enabled on the model', function () {
        before(function () {
          const Model = bookshelf.Model.extend({
            hasSecurePassword: true
          })

          model = new Model({ password: 'testing' })
        })

        it('resolves the Model if the password matches', function () {
          return model.authenticate('testing').then((model) => {
            expect(model).to.be.defined
          }, (err) => {
            expect(err).to.be.undefined
          })
        })

        it('rejects with a PasswordMismatchError if the password does not match', function () {
          return model.authenticate('invalid').then((model) => {
            expect(model).to.be.defined
          }, (err) => {
            expect(err).to.be.defined
            expect(err).to.be.an.instanceof(PasswordMismatchError)
            expect(err.name).to.equal('PasswordMismatchError')
          })
        })

        it('rejects with a PasswordMismatchError if the no password is provided', function () {
          return model.authenticate().then((model) => {
            expect(model).to.be.defined
          }, (err) => {
            expect(err).to.be.defined
            expect(err).to.be.an.instanceof(PasswordMismatchError)
            expect(err.name).to.equal('PasswordMismatchError')
          })
        })
      })

      describe('without hasSecurePassword on this model', function () {
        it('calls the model`s `authenticate` method', function () {
          const Model = bookshelf.Model.extend({})
          model = new Model({ password: 'testing' })

          try {
            return model.authenticate('testing')
          } catch (err) {
            expect(err).to.be.defined
            expect(err).to.be.an.instanceof(TypeError)
          }
        })
      })
    })

    describe('asynchronous save-time behavior', function () {
      let model

      before(function () {
        bookshelf = new Bookshelf(knex)
        bookshelf.plugin(securePassword, {
          performOnSave: true
        })
      })

      describe('with hasSecurePassword enabled on the model', function () {
        before(function () {
          const Model = bookshelf.Model.extend({
            hasSecurePassword: true
          })

          model = new Model({ id: 1, password: 'testing' })
          return model.save()
        })

        it('resolves the Model if the password matches', function () {
          return model.authenticate('testing').then((model) => {
            expect(model).to.be.defined
          }, (err) => {
            expect(err).to.be.undefined
          })
        })

        it('rejects with a PasswordMismatchError if the password does not match', function () {
          return model.authenticate('invalid').then((model) => {
            expect(model).to.be.defined
          }, (err) => {
            expect(err).to.be.defined
            expect(err).to.be.an.instanceof(PasswordMismatchError)
            expect(err.name).to.equal('PasswordMismatchError')
          })
        })

        it('rejects with a PasswordMismatchError if the no password is provided', function () {
          return model.authenticate().then((model) => {
            expect(model).to.be.defined
          }, (err) => {
            expect(err).to.be.defined
            expect(err).to.be.an.instanceof(PasswordMismatchError)
            expect(err.name).to.equal('PasswordMismatchError')
          })
        })
      })

      describe('without hasSecurePassword on this model', function () {
        it('calls the model`s `authenticate` method', function () {
          const Model = bookshelf.Model.extend({})
          model = new Model({ id: 1, password: 'testing' })

          return model
            .save()
            .then((model) => {
              model.authenticate('testing')
            })
            .catch((err) => {
              expect(err).to.be.defined
              expect(err).to.be.an.instanceof(TypeError)
            })
        })
      })
    })
  })
})
