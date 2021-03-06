/* global Physics Utils */
/* exported Enemy Boss */

"use strict";

function Enemy(game, type, isActive) {
  const global = window;
  const stepFn = () => Utils.getRandomInt(0, 1);
  const aspect = game.aspect;
  const enemyData = game.gameData.enemies[type];
  const velocity = enemyData.velocity;
  var hp = enemyData.hitpoints;
  var points = hp;
  const weaponData = enemyData.weapon;
  const weapon = weaponData ? new global[weaponData.type](game, weaponData): null;
  var dmgRate = game.difficultyMap.prediv[game.difficulty];
  var prune = 0;
  const showDestroyedFrames = 8;
  var active = isActive || false;
  var linger = false;
  const verticalPos = (stepFn() ? 1 : -1) * Utils.random() * (1 - game.modelScale);
  const horizontalPos = 1.10 * game.aspect;
  const depthPos = -Utils.random() * 0.05;
  const vertices = [
    new Float32Array(3),
    new Float32Array(3),
    new Float32Array(3)
  ];
  const state = new Physics.State(
    [horizontalPos, verticalPos, depthPos],
    [-velocity, 0, 0]
  );
  var texCoordsBufferIndexShip = enemyData.texType;
  var texCoordsBufferIndexExpl = 0;

  const translations = Object.seal({
    "x": horizontalPos,
    "y": verticalPos,
    "z": depthPos
  });
  const rotations = Object.seal({
    "x": 0,
    "y": Math.PI,
    "z": 0
  });
  const scales = Object.seal({
    "x": enemyData.modelScales[0] * game.modelScale / aspect,
    "y": enemyData.modelScales[1] * game.modelScale,
    "z": enemyData.modelScales[2] * game.modelScale
  });
  const mvUniformMatrix = Utils.modelViewMatrix(
    new Float32Array(16),
    translations,
    rotations,
    scales
  );
  const hitbox = Object.seal({
    "left": 0,
    "right": 0,
    "top": 0,
    "bottom": 0,
    "depth": 0
  });

  this.weaponData = weaponData;

  this.reset = function(isActive) {
    hp = enemyData.hitpoints;
    points = hp;
    dmgRate = game.difficultyMap.prediv[game.difficulty];
    prune = 0;
    active = isActive || false;
    linger = false;
    texCoordsBufferIndexShip = enemyData.texType
    translations.x = horizontalPos;
    translations.y = (stepFn() ? 1 : -1) * Utils.random() * (1 - game.modelScale);

    state.position[0] = translations.x;
    state.position[1] = translations.y;
    state.velocity[0] = -velocity;

    Utils.modelViewMatrix(mvUniformMatrix, translations, rotations, scales);
  };

  this.draw = function(gl) {
    var numTri = 0;
    gl.uniformMatrix4fv(game.mvUniform, false, mvUniformMatrix);

    if (linger) {
      // skip drawing ship
    } else if (prune) {
      gl.activeTexture(game.textures.explosion.texId);
      gl.bindTexture(gl.TEXTURE_2D, game.textures.explosion.tex);
      gl.bindBuffer(gl.ARRAY_BUFFER, game.textures.explosion.coordBuffers[texCoordsBufferIndexExpl]);
      gl.vertexAttribPointer(game.textures.texCoordAttrib, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(game.textureUniform, game.textures.explosion.texIdIndex);

      gl.bindBuffer(gl.ARRAY_BUFFER, game.vertexRectangleBufferObject);
      numTri = game.verticesRectangle.length / 3;
    } else {
      gl.activeTexture(game.textures.enemyShip.texId);
      gl.bindTexture(gl.TEXTURE_2D, game.textures.enemyShip.tex);
      gl.bindBuffer(gl.ARRAY_BUFFER, game.textures.enemyShip.coordBuffers[texCoordsBufferIndexShip]);
      gl.vertexAttribPointer(game.textures.texCoordAttrib, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(game.textureUniform, game.textures.enemyShip.texIdIndex);

      gl.bindBuffer(gl.ARRAY_BUFFER, game.vertexTriangleBufferObject);
      numTri = game.verticesTriangle.length / 3;
    }

    gl.vertexAttribPointer(game.vertexPositionAttrib, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, numTri);

    gl.bindTexture(gl.TEXTURE_2D, null);

    if (weapon) {
      weapon.draw(gl);
    }
  };

  this.update = function(dt) {
    const now = global.performance.now();

    if (hp <= 0 && !linger) {
      if (prune >= showDestroyedFrames) {
        if (weapon && weapon.hasActiveProjectiles()) {
          linger = true;
        }

        game.enemyDestroyedCount += 1;
        active = false;
        return 0;
      }
      prune += 1;
      return 0;
    } else if (hp <= 0 && linger) {
      if (!weapon.hasActiveProjectiles()) {
        linger = false;
        return 0;
      }
    }

    Physics.integrateState(state, game.time, dt);
    mvUniformMatrix[12] = state.position[0];

    let score = 0;
    if (weapon) {
      score += weapon.update(dt, game.players);

      if (!linger) {
        weapon.fireWeapon(now, dt, getHitbox());
      }
    }

    return score;
  };

  this.takeHit = function(pts) {
    hp -= dmgRate * pts;
    return pts;
  };

  this.containsPointHitbox = function(point) {
    const hitbox = getHitbox();
    return (
      (point.x >= hitbox.left) &&
      (point.x <= hitbox.right) &&
      (point.y <= hitbox.top) &&
      (point.y >= hitbox.bottom)
    );
  };

  this.containsPoint = function(point) {
    //Parametric equations solution
    const pos = getPosition();
    const p1 = pos[0], p2 = pos[1], p3 = pos[2];
    const denom = (p2[1] - p3[1])*(p1[0] - p3[0]) + (p3[0] - p2[0])*(p1[1] - p3[1]);
    const a = ((p2[1] - p3[1])*(point.x - p3[0]) + (p3[0] - p2[0])*(point.y - p3[1])) / denom;
    const b = ((p3[1] - p1[1])*(point.x - p3[0]) + (p1[0] - p3[0])*(point.y - p3[1])) / denom;
    const c = 1 - a - b;
    return (
      (0 <= a && a <= 1) &&
      (0 <= b && b <= 1) &&
      (0 <= c && c <= 1)
    );
  };

  this.intersectsWith = function(rect) {
    const hitbox = getHitbox();
    return (
      (rect.left < hitbox.right) &&
      (hitbox.left < rect.right) &&
      (rect.bottom < hitbox.top) &&
      (hitbox.bottom < rect.top)
    );
  };

  function getPosition() {
    //  <|
    const tri = game.verticesTriangleSub;
    const vert1 = tri[0];
    const vert2 = tri[1];
    const vert3 = tri[2];

    const p1 = Utils.matrixMultiplyPoint(
      game.pUniformMatrix,
      Utils.matrixMultiplyPoint(mvUniformMatrix, vert1, vertices[0]),
      vertices[0]
    );
    const p2 = Utils.matrixMultiplyPoint(
      game.pUniformMatrix,
      Utils.matrixMultiplyPoint(mvUniformMatrix, vert2, vertices[1]),
      vertices[1]
    );
    const p3 = Utils.matrixMultiplyPoint(
      game.pUniformMatrix,
      Utils.matrixMultiplyPoint(mvUniformMatrix, vert3, vertices[2]),
      vertices[2]
    );
    vertices[0][0] = p1[0];
    vertices[0][1] = p1[1];
    vertices[0][2] = p1[2];
    vertices[1][0] = p2[0];
    vertices[1][1] = p2[1];
    vertices[1][2] = p2[2];
    vertices[2][0] = p3[0];
    vertices[2][1] = p3[1];
    vertices[2][2] = p3[2];
    return vertices;
  }

  function getPositionLeft() {
    const tri = game.verticesTriangle;
    const x = tri[3], y = tri[4], z = tri[5], w = 1;
    const mvm = mvUniformMatrix;
    const c1r1 = mvm[0], c1r2 = mvm[4], c1r3 = mvm[8], c1r4 = mvm[12];

    return (x*c1r1 + y*c1r2 + z*c1r3 + w*c1r4) * game.pUniformMatrix[0];
  }

  function getPositionRight() {
    const tri = game.verticesTriangle;
    const x = tri[0], y = tri[1], z = tri[2], w = 1;
    const mvm = mvUniformMatrix;
    const c1r1 = mvm[0], c1r2 = mvm[4], c1r3 = mvm[8], c1r4 = mvm[12];

    return (x*c1r1 + y*c1r2 + z*c1r3 + w*c1r4) * game.pUniformMatrix[0];
  }

  function getPositionTop() {
    const tri = game.verticesTriangle;
    const x = tri[0], y = tri[1], z = tri[2], w = 1;
    const mvm = mvUniformMatrix;
    const c2r1 = mvm[1], c2r2 = mvm[5], c2r3 = mvm[9], c2r4 = mvm[13];

    return (x*c2r1 + y*c2r2 + z*c2r3 + w*c2r4) * game.pUniformMatrix[0];
  }

  function getPositionBottom() {
    const tri = game.verticesTriangle;
    const x = tri[6], y = tri[7], z = tri[8], w = 1;
    const mvm = mvUniformMatrix;
    const c2r1 = mvm[1], c2r2 = mvm[5], c2r3 = mvm[9], c2r4 = mvm[13];

    return (x*c2r1 + y*c2r2 + z*c2r3 + w*c2r4) * game.pUniformMatrix[0];
  }

  function getHitbox() {
    hitbox.left = getPositionLeft();
    hitbox.right = getPositionRight();
    hitbox.top = getPositionTop();
    hitbox.bottom = getPositionBottom();
    return hitbox;
  }

  Object.defineProperty(this, "hitpoints", {get: function () {return hp;}});
  Object.defineProperty(this, "maxHitpoints", {get: function () {return enemyData.hitpoints;}});
  Object.defineProperty(this, "points", {get: function () {return points;}});
  Object.defineProperty(this, "prune", {get: function () {return prune >= showDestroyedFrames;}});
  Object.defineProperty(this, "position", {get: getPosition});
  Object.defineProperty(this, "positionLeft", {get: getPositionLeft});
  Object.defineProperty(this, "positionRight", {get: getPositionRight});
  Object.defineProperty(this, "positionTop", {get: getPositionTop});
  Object.defineProperty(this, "positionBottom", {get: getPositionBottom});
  Object.defineProperty(this, "positionDepth", {get: function() {return mvUniformMatrix[14];}});
  Object.defineProperty(this, "hitbox", {get: getHitbox});
  Object.defineProperty(this, "active", {get: function() {return active;}});
  Object.defineProperty(this, "linger", {get: function() {return linger;}});
  Object.defineProperty(this, "enemyType", {get: function() {return type;}});
}

function Boss(game, type, isActive) {
  const global = window;
  const aspect = game.aspect;
  const enemyData = game.gameData.bosses[type];
  const velocity = enemyData.velocity;
  var hp = enemyData.hitpoints;
  var points = hp;
  const maxHP = hp;
  const hpReplenishRate = enemyData.hpReplenishRate;
  const weaponData = enemyData.weapon;
  const weapon = weaponData ? new global[weaponData.type](game, weaponData) : null;
  var dmgRate = game.difficultyMap.prediv[game.difficulty];
  var prune = 0;
  const showDestroyedFrames = 8;
  var active = isActive || false;
  const verticalPos = enemyData.spawnPos[1];
  const horizontalPos = enemyData.spawnPos[0];
  const depthPos = 0.0;
  const vertices = [
    new Float32Array(3),
    new Float32Array(3),
    new Float32Array(3)
  ];
  const state = new Physics.State(
    [horizontalPos, verticalPos, depthPos],
    [0, 0, 0]
  );
  var texCoordsBufferIndexShip = enemyData.texType;
  var texCoordsBufferIndexExpl = 0;

  const translations = Object.seal({
    "x": horizontalPos,
    "y": verticalPos,
    "z": depthPos
  });
  const rotations = Object.seal({
    "x": 0,
    "y": Math.PI,
    "z": 0
  });
  const scales = Object.seal({
    "x": enemyData.modelScales[0] * game.modelScale / aspect,
    "y": enemyData.modelScales[1] * game.modelScale,
    "z": enemyData.modelScales[2] * game.modelScale
  });
  const mvUniformMatrix = Utils.modelViewMatrix(
    new Float32Array(16),
    translations,
    rotations,
    scales
  );
  const hitbox = {
    "left": 0,
    "right": 0,
    "top": 0,
    "bottom": 0,
    "depth": 0
  };

  const Action = Object.freeze({
    "EVADE":        0,
    "TRACK":        1,
    "ATTACK":       2,
    "MULTI_ATTACK": 3,
    "REPLENISH_HP": 4,
    "NUM_STATES":   5
  });

  const ActionFrame = Object.freeze({
    [Action.EVADE]:         80,
    [Action.TRACK]:         80,
    [Action.ATTACK]:        20,
    [Action.MULTI_ATTACK]:  40,
    [Action.REPLENISH_HP]:  40
  });

  var bossActionState = Action.TRACK;
  var bossActionFrame = ActionFrame[bossActionState];

  this.reset = function(isActive) {
    const modelScale = game.modelScale;
    scales.x = enemyData.modelScales[0] * modelScale / aspect;
    scales.y = enemyData.modelScales[1] * modelScale;
    scales.z = enemyData.modelScales[2] * modelScale;
    hp = enemyData.hitpoints;
    points = hp;
    dmgRate = game.difficultyMap.prediv[game.difficulty];
    prune = 0;
    active = isActive || false;
    texCoordsBufferIndexShip = enemyData.texType
    translations.x = enemyData.spawnPos[0];
    translations.y = enemyData.spawnPos[1];

    state.position[0] = translations.x;
    state.position[1] = translations.y;

    Utils.modelViewMatrix(mvUniformMatrix, translations, rotations, scales);
  };

  this.draw = function(gl) {
    var numTri = 0;
    gl.uniformMatrix4fv(game.mvUniform, false, mvUniformMatrix);
    if (prune) {
      gl.activeTexture(game.textures.explosion.texId);
      gl.bindTexture(gl.TEXTURE_2D, game.textures.explosion.tex);
      gl.bindBuffer(gl.ARRAY_BUFFER, game.textures.explosion.coordBuffers[texCoordsBufferIndexExpl]);
      gl.vertexAttribPointer(game.textures.texCoordAttrib, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(game.textureUniform, game.textures.explosion.texIdIndex);

      gl.bindBuffer(gl.ARRAY_BUFFER, game.vertexRectangleBufferObject);
      numTri = game.verticesRectangle.length / 3;
    } else {
      gl.activeTexture(game.textures.boss.texId);
      gl.bindTexture(gl.TEXTURE_2D, game.textures.boss.tex);
      gl.bindBuffer(gl.ARRAY_BUFFER, game.textures.boss.coordBuffers[texCoordsBufferIndexShip]);
      gl.vertexAttribPointer(game.textures.texCoordAttrib, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(game.textureUniform, game.textures.boss.texIdIndex);

      gl.bindBuffer(gl.ARRAY_BUFFER, game.vertexTriangleBufferObject);
      numTri = game.verticesTriangle.length / 3;
    }

    gl.vertexAttribPointer(game.vertexPositionAttrib, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, numTri);

    gl.bindTexture(gl.TEXTURE_2D, null);

    if (weapon) {
      weapon.draw(gl);
    }
  };

  this.update = function(dt) {
    var score = 0;
    if (hp <= 0) {
      if (prune > showDestroyedFrames) {
        active = false;
        return score;
      }
      prune += 1;
      return score;
    }

    bossActionFrame -= 1;
    if (!bossActionFrame) {
      bossActionState = Utils.getRandomInt(0, Action.NUM_STATES - 1);
      bossActionFrame = ActionFrame[bossActionState];
    }

    const frameMax = ActionFrame[bossActionState];
    if (bossActionState === Action.EVADE) {
      if (bossActionFrame === frameMax) {
        const playerWeapons = game.player.weapons;
        const hitbox = getHitbox();
        const midX = 0.5 * (hitbox.left + hitbox.right);
        const midY = 0.5 * (hitbox.top + hitbox.bottom);
        let closestY = 0;
        let closest = 4;
        for (let k = 0, n = playerWeapons.length; k < n; k += 1) {
          const projectiles = playerWeapons[k].projectiles;
          for (let iK = 0, iN = projectiles.length; iK < iN; iK += 1) {
            const proj = projectiles[iK];
            if (!proj.active) {
              continue;
            }
            const projHitbox = proj.hitbox;
            const projMidX = 0.5 * (projHitbox.left + projHitbox.right);
            const projMidY = 0.5 * (projHitbox.top + projHitbox.bottom);
            const dist = Math.pow(midX - projMidX, 2) + Math.pow(midY - projMidY, 2);
            if (projMidX > midX) {
              continue;
            } else if (dist < closest) {
              closest = dist;
              closestY = projMidY;
            }
          }
        }
        if (closestY > 0 && midY > -1) {
          state.velocity[1] = -velocity;
        } else if (closestY < 0 && midY < 1) {
          state.velocity[1] = velocity;
        } else {
          state.velocity[1] = 0;
        }
        state.velocity[0] = 0;
      }
    } else if (bossActionState === Action.TRACK) {
      const playerHitbox = game.player.hitbox;
      const playerMidY = 0.5 * (playerHitbox.top + playerHitbox.bottom);
      const hitbox = getHitbox();
      const midY = 0.5 * (hitbox.top + hitbox.bottom);
      if (midY < playerMidY) {
        state.velocity[1] = velocity;
      } else {
        state.velocity[1] = -velocity;
      }
    } else if (bossActionState === Action.ATTACK) {
      if (bossActionFrame === frameMax) {
        state.velocity[0] = 0;
        state.velocity[1] = 0;
        weapon.fireWeapon(global.performance.now(), dt, getHitbox());
      }
    } else if (bossActionState === Action.MULTI_ATTACK) {
      if (bossActionFrame % 5 === 0) {
        state.velocity[0] = 0;
        state.velocity[1] = 0;
        weapon.fireWeapon(global.performance.now(), dt, getHitbox());
      }
    } else if (bossActionState === Action.REPLENISH_HP) {
      hp = Utils.clamp(hp + hpReplenishRate, 0, maxHP);
      game.overlayState.flag |= game.OverlayFlags.INCREMENT | game.OverlayFlags.BOSS_HP_DIRTY;
    }

    Physics.integrateState(state, game.time, dt);
    mvUniformMatrix[12] = state.position[0];
    mvUniformMatrix[13] = state.position[1];
    score += weapon.update(dt, game.players);

    return score;
  };

  this.takeHit = function(pts) {
    hp -= dmgRate * pts;
    return pts;
  };

  this.containsPointHitbox = function(point) {
    const hitbox = getHitbox();
    return (
      (point.x >= hitbox.left) &&
      (point.x <= hitbox.right) &&
      (point.y <= hitbox.top) &&
      (point.y >= hitbox.bottom)
    );
  };

  this.containsPoint = function(point) {
    //Parametric equations solution
    const pos = getPosition();
    const p1 = pos[0], p2 = pos[1], p3 = pos[2];
    const denom = (p2[1] - p3[1])*(p1[0] - p3[0]) + (p3[0] - p2[0])*(p1[1] - p3[1]);
    const a = ((p2[1] - p3[1])*(point.x - p3[0]) + (p3[0] - p2[0])*(point.y - p3[1])) / denom;
    const b = ((p3[1] - p1[1])*(point.x - p3[0]) + (p1[0] - p3[0])*(point.y - p3[1])) / denom;
    const c = 1 - a - b;
    return (
      (0 <= a && a <= 1) &&
      (0 <= b && b <= 1) &&
      (0 <= c && c <= 1)
    );
  };

  this.intersectsWith = function(rect) {
    const hitbox = getHitbox();
    return (
      (rect.left < hitbox.right) &&
      (hitbox.left < rect.right) &&
      (rect.bottom < hitbox.top) &&
      (hitbox.bottom < rect.top)
    );
  };

  function getPosition() {
    //  <|
    const tri = game.verticesTriangleSub;
    const vert1 = tri[0];
    const vert2 = tri[1];
    const vert3 = tri[2];

    const p1 = Utils.matrixMultiplyPoint(
      game.pUniformMatrix,
      Utils.matrixMultiplyPoint(mvUniformMatrix, vert1, vertices[0]),
      vertices[0]
    );
    const p2 = Utils.matrixMultiplyPoint(
      game.pUniformMatrix,
      Utils.matrixMultiplyPoint(mvUniformMatrix, vert2, vertices[1]),
      vertices[1]
    );
    const p3 = Utils.matrixMultiplyPoint(
      game.pUniformMatrix,
      Utils.matrixMultiplyPoint(mvUniformMatrix, vert3, vertices[2]),
      vertices[2]
    );
    vertices[0][0] = p1[0];
    vertices[0][1] = p1[1];
    vertices[0][2] = p1[2];
    vertices[1][0] = p2[0];
    vertices[1][1] = p2[1];
    vertices[1][2] = p2[2];
    vertices[2][0] = p3[0];
    vertices[2][1] = p3[1];
    vertices[2][2] = p3[2];
    return vertices;
  }

  function getPositionLeft() {
    const tri = game.verticesTriangle;
    const x = tri[3], y = tri[4], z = tri[5], w = 1;
    const mvm = mvUniformMatrix;
    const c1r1 = mvm[0], c1r2 = mvm[4], c1r3 = mvm[8], c1r4 = mvm[12];

    return (x*c1r1 + y*c1r2 + z*c1r3 + w*c1r4) * game.pUniformMatrix[0];
  }

  function getPositionRight() {
    const tri = game.verticesTriangle;
    const x = tri[0], y = tri[1], z = tri[2], w = 1;
    const mvm = mvUniformMatrix;
    const c1r1 = mvm[0], c1r2 = mvm[4], c1r3 = mvm[8], c1r4 = mvm[12];

    return (x*c1r1 + y*c1r2 + z*c1r3 + w*c1r4) * game.pUniformMatrix[0];
  }

  function getPositionTop() {
    const tri = game.verticesTriangle;
    const x = tri[0], y = tri[1], z = tri[2], w = 1;
    const mvm = mvUniformMatrix;
    const c2r1 = mvm[1], c2r2 = mvm[5], c2r3 = mvm[9], c2r4 = mvm[13];

    return (x*c2r1 + y*c2r2 + z*c2r3 + w*c2r4) * game.pUniformMatrix[0];
  }

  function getPositionBottom() {
    const tri = game.verticesTriangle;
    const x = tri[6], y = tri[7], z = tri[8], w = 1;
    const mvm = mvUniformMatrix;
    const c2r1 = mvm[1], c2r2 = mvm[5], c2r3 = mvm[9], c2r4 = mvm[13];

    return (x*c2r1 + y*c2r2 + z*c2r3 + w*c2r4) * game.pUniformMatrix[0];
  }

  function getHitbox() {
    hitbox.left = getPositionLeft();
    hitbox.right = getPositionRight();
    hitbox.top = getPositionTop();
    hitbox.bottom = getPositionBottom();
    return hitbox;
  }

  Object.defineProperty(this, "hitpoints", {get: function () {return hp;}});
  Object.defineProperty(this, "maxHitpoints", {get: function () {return maxHP;}});
  Object.defineProperty(this, "points", {get: function () {return points;}});
  Object.defineProperty(this, "prune", {get: function () {return prune >= showDestroyedFrames;}});
  Object.defineProperty(this, "position", {get: getPosition});
  Object.defineProperty(this, "positionLeft", {get: getPositionLeft});
  Object.defineProperty(this, "positionRight", {get: getPositionRight});
  Object.defineProperty(this, "positionTop", {get: getPositionTop});
  Object.defineProperty(this, "positionBottom", {get: getPositionBottom});
  Object.defineProperty(this, "positionDepth", {get: function() {return mvUniformMatrix[14];}});
  Object.defineProperty(this, "hitbox", {get: getHitbox});
  Object.defineProperty(this, "active", {get: function() {return active;}});
  Object.defineProperty(this, "enemyType", {get: function() {return type;}});
}
