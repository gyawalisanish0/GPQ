import Phaser from 'phaser';
import { SwipeHandler } from '../engine/SwipeHandler';
import { GameLogic, ShapeType, SpecialType, LogicCell, MatchResult } from '../engine/GameLogic';
import { EffectManager, IEffectDelegate } from '../engine/EffectManager';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CombatManager } from '../engine/CombatManager';
import { Character } from '../entities/Character';
import { OpponentAI } from '../engine/OpponentAI';
import { GemRegistry } from '../engine/GemRegistry';
import { SoundManager, SoundType } from '../engine/SoundManager';
import { BaseScene } from './BaseScene';

const GRID_SIZE = 10;

// Mutable per-frame values rebuilt in onInit()
let CELL_SIZE       = 88;
let BASE_GRID_WIDTH = 880;

interface HudConfig {
    userWidth:        number;
    opponentWidth:    number;
    userHeight:       number;
    opponentHeight:   number;
    userBarWidth:     number;
    opponentBarWidth: number;
    padding:          number;
    barHeight:        number;
    skillSize:        number;
    marginX:          number;
    marginY:          number;
    colors: {
        hp:             number;
        charge:         number;
        opponentHp:     number;
        opponentCharge: number;
        bg:             number;
        border:         number;
    };
}

let HUD: HudConfig = {
    userWidth: 720, opponentWidth: 480,
    userHeight: 270, opponentHeight: 180,
    userBarWidth: 608, opponentBarWidth: 372,
    padding: 20, barHeight: 21, skillSize: 128,
    marginX: 24, marginY: 96,
    colors: { hp: 0x10b981, charge: 0x3b82f6, opponentHp: 0xef4444, opponentCharge: 0xeab308, bg: 0x000000, border: 0xffffff }
};

interface VisualCell { sprite: Phaser.GameObjects.Container; }

export class Game_Scene extends BaseScene implements IEffectDelegate {
    constructor() { super('Game_Scene'); }

    private logic!:         GameLogic;
    private visualGrid:     (VisualCell | null)[][] = [];
    private isProcessing  = false;
    private isGameOver    = false;
    private powerSurge    = 0;
    private selectionRect!: Phaser.GameObjects.Rectangle;
    private swipeHandler!:  SwipeHandler;
    private effectManager!: EffectManager;
    private colors: Record<ShapeType, number> = {} as any;

    private userHUD!:               Phaser.GameObjects.Container;
    private opponentHUD!:           Phaser.GameObjects.Container;
    private powerText!:             Phaser.GameObjects.Text;
    private userHpBar!:             Phaser.GameObjects.Graphics;
    private userChargeBar!:         Phaser.GameObjects.Graphics;
    private opponentHpBar!:         Phaser.GameObjects.Graphics;
    private opponentChargeBar!:     Phaser.GameObjects.Graphics;
    private userHpText!:            Phaser.GameObjects.Text;
    private userChargeText!:        Phaser.GameObjects.Text;
    private opponentHpText!:        Phaser.GameObjects.Text;
    private opponentChargeText!:    Phaser.GameObjects.Text;
    private skillButtons:           Phaser.GameObjects.Container[] = [];
    private opponentAI:             OpponentAI | null = null;
    private userGlow!:              Phaser.GameObjects.Graphics;
    private opponentGlow!:          Phaser.GameObjects.Graphics;
    private turnHUD!:               Phaser.GameObjects.Container;
    private powerHUD!:              Phaser.GameObjects.Container;
    private turnCountText!:         Phaser.GameObjects.Text;
    private activeSkillBtn!:        Phaser.GameObjects.Container;
    private queuedIconsContainer!:          Phaser.GameObjects.Container;
    private opponentQueuedIconsContainer!:  Phaser.GameObjects.Container;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    protected onInit() {
        this.isGameOver = false;

        const sf = this.scaleFactor;
        CELL_SIZE       = Math.floor(88 * sf);
        BASE_GRID_WIDTH = CELL_SIZE * GRID_SIZE;

        // Left-side space available for HUDs
        const leftSpace = this.getOffsetXPreview();

        // Clamp HUD widths so they never overflow the space beside the grid
        const userW = Math.min(Math.floor(720 * sf), Math.floor(leftSpace * 0.98));
        const oppW  = Math.min(Math.floor(480 * sf), Math.floor(leftSpace * 0.98));

        HUD = {
            ...HUD,
            userWidth:        userW,
            opponentWidth:    oppW,
            userHeight:       Math.floor(270 * sf),
            opponentHeight:   Math.floor(180 * sf),
            userBarWidth:     Math.max(50, Math.min(Math.floor(608 * sf), userW - Math.floor(100 * sf))),
            opponentBarWidth: Math.max(50, Math.min(Math.floor(372 * sf), oppW  - Math.floor(100 * sf))),
            padding:          Math.floor(20  * sf),
            barHeight:        Math.floor(21  * sf),
            skillSize:        Math.floor(128 * sf),
            marginX:          Math.floor(24  * sf),
            marginY:          Math.floor(96  * sf),
        };

        const registry   = GemRegistry.getInstance();
        const normalGems = registry.getAllGems().filter(g => g.type === 'normal');
        normalGems.forEach(gem => {
            if (gem.shape && gem.color) {
                const st = ShapeType[gem.shape as keyof typeof ShapeType];
                this.colors[st] = parseInt(gem.color.replace('0x', ''), 16);
            }
        });
        if (Object.keys(this.colors).length === 0) {
            this.colors = {
                [ShapeType.TRIANGLE]: 0x3b82f6, [ShapeType.SQUARE]: 0x22c55e,
                [ShapeType.PENTAGON]: 0xec4899, [ShapeType.HEXAGON]: 0xeab308,
                [ShapeType.STAR]:     0xef4444, [ShapeType.NONE]:    0x8b5cf6,
            };
        }
    }

    /** Approximate offset without a full create() call, used in onInit(). */
    private getOffsetXPreview(): number {
        const gridW = 88 * this.scaleFactor * GRID_SIZE;
        return (this.gameWidth - gridW) / 2;
    }

    preload() { this.createTextures(); }

    // ─── Texture generation ───────────────────────────────────────────────────

    private createTextures() {
        const g = this.make.graphics({ x: 0, y: 0 });

        Object.entries(this.colors).forEach(([type, color]) => {
            g.clear();
            const size   = CELL_SIZE * 0.7;
            const center = CELL_SIZE / 2;
            if (type === ShapeType.NONE) {
                g.fillStyle(0x111111, 1); g.fillCircle(center, center, size / 2 + 4);
                g.lineStyle(3, 0x8b5cf6, 1); g.strokeCircle(center, center, size / 2 + 4);
                g.fillStyle(0x8b5cf6, 0.5); g.fillCircle(center, center, size / 3);
                g.fillStyle(0xffffff, 0.8); g.fillCircle(center, center, size / 6);
            } else {
                this.drawGem(g, type as ShapeType, color, center, size);
            }
            g.generateTexture(`shape_${type}`, CELL_SIZE, CELL_SIZE);
        });

        ['slash','fury','fireball','arcane_focus','ice_lance'].forEach(icon => {
            g.clear(); g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 64, 64);
            g.generateTexture(`icon_${icon}`, 64, 64);
        });

        // Pulsar
        g.clear(); g.fillStyle(0xffffff, 0.9);
        [[0.1,0.5,0.3,0.35,0.3,0.65],[0.9,0.5,0.7,0.35,0.7,0.65],
         [0.5,0.1,0.35,0.3,0.65,0.3],[0.5,0.9,0.35,0.7,0.65,0.7]].forEach(([ax,ay,bx,by,cx,cy]) => {
            g.beginPath(); g.moveTo(CELL_SIZE*ax,CELL_SIZE*ay); g.lineTo(CELL_SIZE*bx,CELL_SIZE*by);
            g.lineTo(CELL_SIZE*cx,CELL_SIZE*cy); g.closePath(); g.fillPath();
        });
        g.lineStyle(3, 0xffffff, 0.8); g.strokeCircle(CELL_SIZE/2, CELL_SIZE/2, CELL_SIZE*0.2);
        g.generateTexture('special_pulsar', CELL_SIZE, CELL_SIZE);

        // Missile
        g.clear();
        g.fillStyle(0xffffff, 0.9);
        g.beginPath(); g.moveTo(CELL_SIZE/2, CELL_SIZE*0.15);
        g.lineTo(CELL_SIZE*0.65,CELL_SIZE*0.4); g.lineTo(CELL_SIZE*0.65,CELL_SIZE*0.7);
        g.lineTo(CELL_SIZE*0.35,CELL_SIZE*0.7); g.lineTo(CELL_SIZE*0.35,CELL_SIZE*0.4);
        g.closePath(); g.fillPath();
        g.fillStyle(0xff3300, 0.9);
        [[0.35,0.5,0.15,0.75,0.35,0.7],[0.65,0.5,0.85,0.75,0.65,0.7]].forEach(([ax,ay,bx,by,cx,cy]) => {
            g.beginPath(); g.moveTo(CELL_SIZE*ax,CELL_SIZE*ay); g.lineTo(CELL_SIZE*bx,CELL_SIZE*by);
            g.lineTo(CELL_SIZE*cx,CELL_SIZE*cy); g.closePath(); g.fillPath();
        });
        g.fillStyle(0x00ffff,0.9); g.fillCircle(CELL_SIZE/2,CELL_SIZE*0.45,CELL_SIZE*0.1);
        g.fillStyle(0xffaa00,0.9);
        g.beginPath(); g.moveTo(CELL_SIZE*0.4,CELL_SIZE*0.7); g.lineTo(CELL_SIZE/2,CELL_SIZE*0.9);
        g.lineTo(CELL_SIZE*0.6,CELL_SIZE*0.7); g.closePath(); g.fillPath();
        g.generateTexture('special_missile', CELL_SIZE, CELL_SIZE);

        // Bomb
        g.clear();
        g.lineStyle(4, 0x444444, 1); g.strokeCircle(CELL_SIZE/2,CELL_SIZE/2,CELL_SIZE*0.35);
        g.lineStyle(2, 0xffffff, 0.8); g.strokeCircle(CELL_SIZE/2,CELL_SIZE/2,CELL_SIZE*0.35);
        g.lineStyle(3, 0xffaa00, 1);
        for (let i=0;i<8;i++){const a=(i/8)*Math.PI*2; g.moveTo(CELL_SIZE/2+Math.cos(a)*CELL_SIZE*0.35,CELL_SIZE/2+Math.sin(a)*CELL_SIZE*0.35); g.lineTo(CELL_SIZE/2+Math.cos(a)*CELL_SIZE*0.45,CELL_SIZE/2+Math.sin(a)*CELL_SIZE*0.45);}
        g.strokePath();
        g.fillStyle(0xff3300,1); g.fillCircle(CELL_SIZE*0.75,CELL_SIZE*0.25,CELL_SIZE*0.12);
        g.fillStyle(0xffaa00,1); g.fillCircle(CELL_SIZE*0.75,CELL_SIZE*0.25,CELL_SIZE*0.08);
        g.fillStyle(0xffffff,1); g.fillCircle(CELL_SIZE*0.75,CELL_SIZE*0.25,CELL_SIZE*0.04);
        g.generateTexture('special_bomb', CELL_SIZE, CELL_SIZE);

        // Parasite
        g.clear();
        g.lineStyle(3, 0xd946ef, 1); g.fillStyle(0x8b5cf6, 0.9);
        this.drawStar(g, CELL_SIZE/2, CELL_SIZE/2, 12, CELL_SIZE*0.45, CELL_SIZE*0.2);
        g.fillPath(); g.strokePath();
        g.fillStyle(0xffffff, 0.8); g.fillCircle(CELL_SIZE/2, CELL_SIZE/2, CELL_SIZE*0.1);
        g.generateTexture('special_parasite', CELL_SIZE, CELL_SIZE);

        g.clear(); g.fillStyle(0xffffff,1); g.fillCircle(4,4,4); g.generateTexture('particle',8,8);
        g.clear(); g.fillStyle(0xffffff,0.8); g.fillCircle(2,2,2); g.generateTexture('star_particle',4,4);
    }

    private drawGem(g: Phaser.GameObjects.Graphics, type: ShapeType, color: number, center: number, size: number) {
        const co = Phaser.Display.Color.ValueToColor(color);
        const lc = co.clone().lighten(30).color;
        const dc = co.clone().darken(30).color;
        g.fillStyle(0x000000,0.4); this.drawShapePath(g,type,center,center+4,size); g.fillPath();
        g.fillStyle(dc,1);         this.drawShapePath(g,type,center,center,size);   g.fillPath();
        g.fillStyle(color,1);      this.drawShapePath(g,type,center,center,size*0.85); g.fillPath();
        g.fillStyle(lc,1);         this.drawShapePath(g,type,center,center,size*0.5);  g.fillPath();
        g.fillStyle(0xffffff,0.5); g.beginPath(); g.arc(center-size*0.15,center-size*0.15,size*0.15,0,Math.PI*2); g.fillPath();
    }

    private drawShapePath(g: Phaser.GameObjects.Graphics, type: ShapeType, x: number, y: number, size: number) {
        g.beginPath();
        switch(type){
            case ShapeType.TRIANGLE: g.moveTo(x,y-size/2); g.lineTo(x-size/2,y+size/2); g.lineTo(x+size/2,y+size/2); break;
            case ShapeType.SQUARE:   g.moveTo(x-size/2,y-size/2); g.lineTo(x+size/2,y-size/2); g.lineTo(x+size/2,y+size/2); g.lineTo(x-size/2,y+size/2); break;
            case ShapeType.PENTAGON: for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2-Math.PI/2;const px=x+Math.cos(a)*(size/2),py=y+Math.sin(a)*(size/2);i===0?g.moveTo(px,py):g.lineTo(px,py);} break;
            case ShapeType.HEXAGON:  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2-Math.PI/2;const px=x+Math.cos(a)*(size/2),py=y+Math.sin(a)*(size/2);i===0?g.moveTo(px,py):g.lineTo(px,py);} break;
            case ShapeType.STAR:
                for(let i=0;i<10;i++){const r=i%2===0?size/2:size/4;const a=(i/10)*Math.PI*2-Math.PI/2;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i===0?g.moveTo(px,py):g.lineTo(px,py);} break;
            case ShapeType.NONE: g.arc(x,y,size/2,0,Math.PI*2); break;
        }
        g.closePath();
    }

    private drawStar(g: Phaser.GameObjects.Graphics, x:number,y:number,pts:number,oR:number,iR:number) {
        const step=Math.PI/pts; g.beginPath();
        for(let i=0;i<2*pts;i++){const r=i%2===0?oR:iR;const a=i*step-Math.PI/2;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i===0?g.moveTo(px,py):g.lineTo(px,py);}
        g.closePath(); g.fillPath(); g.strokePath();
    }

    // ─── create() ─────────────────────────────────────────────────────────────

    create(data: { userCharId?: string; opponentCharId?: string }) {
        this.logic = new GameLogic(GRID_SIZE);
        this.logic.initializeGrid();
        while (!this.logic.hasPossibleMoves()) this.logic.initializeGrid();
        this.effectManager = new EffectManager(this);

        const W = this.gameWidth, H = this.gameHeight;
        const gridW   = GRID_SIZE * CELL_SIZE;
        const offsetX = this.getOffsetX();
        const offsetY = this.getOffsetY();

        const bg = this.add.graphics();
        bg.fillGradientStyle(0x0a0a2a,0x1a0a3a,0x0a1a3a,0x050515,1,1,1,1);
        bg.fillRect(0,0,W,H);

        this.add.particles(0,0,'star_particle',{x:{min:0,max:W},y:{min:H,max:H+100},lifespan:10000,speedY:{min:-10,max:-30},speedX:{min:-10,max:10},scale:{start:0.5,end:1.5},alpha:{start:0,end:0.5,ease:'Sine.easeInOut'},quantity:1,frequency:300,blendMode:'ADD'});
        this.add.image(W/2,H/2,'menu_bg').setDisplaySize(W,H).setAlpha(0.2);

        const boardBg = this.add.graphics();
        boardBg.lineStyle(6,0x4a00e0,0.4); boardBg.strokeRoundedRect(offsetX-12,offsetY-12,gridW+24,gridW+24,20);
        boardBg.fillStyle(0x000000,0.6);   boardBg.fillRoundedRect(offsetX-10,offsetY-10,gridW+20,gridW+20,16);
        boardBg.lineStyle(2,0xffffff,0.05);
        for(let i=1;i<GRID_SIZE;i++){boardBg.moveTo(offsetX+i*CELL_SIZE,offsetY);boardBg.lineTo(offsetX+i*CELL_SIZE,offsetY+gridW);boardBg.moveTo(offsetX,offsetY+i*CELL_SIZE);boardBg.lineTo(offsetX+gridW,offsetY+i*CELL_SIZE);}
        boardBg.strokePath();

        this.selectionRect = this.add.rectangle(0,0,CELL_SIZE,CELL_SIZE,0xffffff,0)
            .setOrigin(0.5).setStrokeStyle(4,0x00ffff,1).setVisible(false).setDepth(10);
        this.tweens.add({targets:this.selectionRect,alpha:0.5,scale:1.1,duration:400,yoyo:true,repeat:-1});

        this.initVisualGrid(offsetX,offsetY);

        this.swipeHandler = new SwipeHandler(this,CELL_SIZE,offsetX,offsetY,GRID_SIZE,
            (s,e)=>{ if(!this.isProcessing && CombatManager.getInstance().currentTurn==='USER') this.swapCells(s.r,s.c,e.r,e.c); },
            (r,c)=>this.updateSelectionRect(r,c),
            (r,c)=>this.updateSelectionRect(r,c),
            ()=>this.selectionRect.setVisible(false)
        );

        this.game.events.emit('SCENE_READY','Game_Scene');

        const reg = CombatRegistry.getInstance();
        const user     = reg.getCharacter(data?.userCharId     || 'warrior');
        const opponent = reg.getCharacter(data?.opponentCharId || 'mage');
        if (user && opponent) {
            CombatManager.getInstance().init(user,opponent);
            this.createHUD();
            this.setupCombatListeners();
            this.opponentAI = new OpponentAI(this.game,this.logic,
                async(r1,c1,r2,c2)=>await this.swapCells(r1,c1,r2,c2),
                ()=>this.powerSurge
            );
        }

        this.events.on('shutdown',this.shutdown,this);
    }

    // ─── HUD ──────────────────────────────────────────────────────────────────

    private createHUD() {
        const W=this.gameWidth, H=this.gameHeight;
        const offsetX=this.getOffsetX(), offsetY=this.getOffsetY(), gridW=BASE_GRID_WIDTH;

        this.opponentHUD = this.add.container(HUD.marginX, HUD.marginY);
        this.drawCharacterHUD(this.opponentHUD,'OPPONENT',false);

        this.userHUD = this.add.container(HUD.marginX, H - HUD.marginY - HUD.userHeight);
        this.drawCharacterHUD(this.userHUD,'USER',true);

        const oppHudBottom  = HUD.marginY + HUD.opponentHeight;
        const userHudTop    = H - HUD.marginY - HUD.userHeight;
        const boardBottom   = offsetY + gridW;
        const oppQueuedY    = oppHudBottom  + (offsetY - oppHudBottom)  / 2;
        const userQueuedY   = boardBottom   + (userHudTop - boardBottom) / 2;

        this.queuedIconsContainer         = this.add.container(HUD.marginX + 240*this.scaleFactor, userQueuedY);
        this.opponentQueuedIconsContainer = this.add.container(HUD.marginX + 160*this.scaleFactor, oppQueuedY);

        this.game.events.on('SKILL_QUEUED',(data:{character:string,icon:string,skillId:string})=>{
            if(data.character==='USER'){
                const ico=this.add.image(0,0,data.icon).setDisplaySize(84.5*this.scaleFactor,84.5*this.scaleFactor).setInteractive({useHandCursor:true});
                ico.setData('skillId',data.skillId);
                ico.on('pointerdown',()=>CombatManager.getInstance().removeQueuedSkill(data.skillId,'USER'));
                this.queuedIconsContainer.add(ico);
                this.queuedIconsContainer.getAll().forEach((c,i)=>{(c as Phaser.GameObjects.Image).x=(i-(this.queuedIconsContainer.length-1)/2)*92.5*this.scaleFactor;});
                const btn=this.skillButtons.find(b=>b.getData('skillId')===data.skillId);
                if(btn) btn.setVisible(false);
            } else {
                const ico=this.add.image(0,0,data.icon).setDisplaySize(37*this.scaleFactor,37*this.scaleFactor);
                ico.setData('skillId',data.skillId);
                this.opponentQueuedIconsContainer.add(ico);
                this.opponentQueuedIconsContainer.getAll().forEach((c,i)=>{(c as Phaser.GameObjects.Image).x=(i-(this.opponentQueuedIconsContainer.length-1)/2)*46*this.scaleFactor;});
            }
        });

        this.game.events.on('SKILL_DEACTIVATED',(data:{character:string,icon:string,skillId?:string})=>{
            const ct=data.character==='USER'?this.queuedIconsContainer:this.opponentQueuedIconsContainer;
            const ico=ct.getAll().find(c=>{const img=c as Phaser.GameObjects.Image;return(data.skillId&&img.getData('skillId')===data.skillId)||img.texture.key===data.icon;});
            if(ico){
                const sid=ico.getData('skillId');
                const spacing=data.character==='USER'?92.5*this.scaleFactor:46*this.scaleFactor;
                ct.remove(ico,true);
                ct.getAll().forEach((c,i)=>{(c as Phaser.GameObjects.Image).x=(i-(ct.length-1)/2)*spacing;});
                if(data.character==='USER'&&sid){const b=this.skillButtons.find(b=>b.getData('skillId')===sid);if(b)b.setVisible(true);}
            }
        });

        // Power HUD (top-right)
        const phW=240*this.scaleFactor, phH=120*this.scaleFactor;
        const phX=W-offsetX-phW, phY=96*this.scaleFactor;
        this.powerHUD=this.add.container(phX,phY);
        const pb=this.add.graphics();
        pb.fillStyle(0x000000,0.5); pb.fillRoundedRect(0,0,phW,phH,24*this.scaleFactor);
        pb.lineStyle(2,0xffffff,0.1); pb.strokeRoundedRect(0,0,phW,phH,24*this.scaleFactor);
        this.powerHUD.add(pb);
        this.powerHUD.add(this.add.text(20*this.scaleFactor,22*this.scaleFactor,'POWER',{fontFamily:'monospace',fontSize:`${this.fs(18)}px`,color:'#ffffff'}).setAlpha(0.5));
        this.powerText=this.add.text(20*this.scaleFactor,52*this.scaleFactor,'0',{fontFamily:'monospace',fontSize:`${this.fs(36)}px`,fontStyle:'bold',color:'#fbbf24'});
        this.powerHUD.add(this.powerText);

        // Turn count HUD
        const thW=90*this.scaleFactor, thH=120*this.scaleFactor;
        const thX=phX-12*this.scaleFactor-thW, thY=96*this.scaleFactor;
        this.turnHUD=this.add.container(thX,thY);
        const tb=this.add.graphics();
        tb.fillStyle(0x000000,0.5); tb.fillRoundedRect(0,0,thW,thH,24*this.scaleFactor);
        tb.lineStyle(2,0xffffff,0.1); tb.strokeRoundedRect(0,0,thW,thH,24*this.scaleFactor);
        this.turnHUD.add(tb);
        this.turnHUD.add(this.add.text(thW/2,22*this.scaleFactor,'TURNS',{fontFamily:'monospace',fontSize:`${this.fs(18)}px`,color:'#ffffff'}).setOrigin(0.5,0).setAlpha(0.5));
        this.turnCountText=this.add.text(thW/2,52*this.scaleFactor,'1',{fontFamily:'monospace',fontSize:`${this.fs(36)}px`,fontStyle:'bold',color:'#3b82f6'}).setOrigin(0.5,0);
        this.turnHUD.add(this.turnCountText);

        this.ActiveSkillButton();
        this.handleTurnSwitched(CombatManager.getInstance().currentTurn);
    }

    private ActiveSkillButton() {
        const W=this.gameWidth, H=this.gameHeight;
        const combat=CombatManager.getInstance(), user=combat.user;
        if(!user||!user.loadout.active) return;
        const skillId=user.loadout.active;
        const skill=CombatRegistry.getInstance().getSkill(skillId);
        const size=180*this.scaleFactor;
        const x=W-this.getOffsetX()-size/2;
        const y=H-HUD.marginY-HUD.userHeight/2;
        this.activeSkillBtn=this.add.container(x,y);
        const bg=this.add.graphics();
        bg.fillStyle(0x000000,0.8); bg.fillCircle(0,0,size/2); bg.lineStyle(4,0x10b981,1); bg.strokeCircle(0,0,size/2);
        this.activeSkillBtn.add(bg);
        this.activeSkillBtn.add(this.add.text(0,-15*this.scaleFactor,'⚡',{fontSize:`${this.fs(60)}px`}).setOrigin(0.5));
        this.activeSkillBtn.add(this.add.text(0,35*this.scaleFactor,skill?skill.name.toUpperCase():'SKILL',{fontFamily:'monospace',fontSize:`${this.fs(20)}px`,fontStyle:'bold',color:'#ffffff'}).setOrigin(0.5));
        this.activeSkillBtn.add(this.add.text(0,60*this.scaleFactor,skill?`${skill.chargeCost} EP`:'',{fontFamily:'monospace',fontSize:`${this.fs(16)}px`,color:'#3b82f6'}).setOrigin(0.5));
        this.activeSkillBtn.setInteractive(new Phaser.Geom.Circle(0,0,size/2),Phaser.Geom.Circle.Contains);
        this.activeSkillBtn.on('pointerover',()=>{SoundManager.getInstance().play(SoundType.SELECT);this.tweens.add({targets:this.activeSkillBtn,scale:1.1,duration:100});bg.clear();bg.fillStyle(0x10b981,0.2);bg.fillCircle(0,0,size/2);bg.lineStyle(4,0x34d399,1);bg.strokeCircle(0,0,size/2);});
        this.activeSkillBtn.on('pointerout',()=>{this.tweens.add({targets:this.activeSkillBtn,scale:1,duration:100});bg.clear();bg.fillStyle(0x000000,0.8);bg.fillCircle(0,0,size/2);bg.lineStyle(4,0x10b981,1);bg.strokeCircle(0,0,size/2);});
        this.activeSkillBtn.on('pointerdown',()=>{
            SoundManager.getInstance().play(SoundType.CLICK);
            this.tweens.add({targets:this.activeSkillBtn,scale:0.9,duration:50,yoyo:true});
            const cm=CombatManager.getInstance(), u=cm.user;
            if(u&&skill&&u.currentCharge>=skill.chargeCost&&cm.currentTurn==='USER')
                this.game.events.emit('SKILL_ACTIVATED',{character:'USER',skillId,powerSurge:this.powerSurge});
            else {
                this.tweens.add({targets:this.activeSkillBtn,x:x+5*this.scaleFactor,duration:50,yoyo:true,repeat:3});
                if(u&&skill&&u.currentCharge<skill.chargeCost&&this.userChargeBar)
                    this.tweens.add({targets:this.userChargeBar,alpha:0.2,duration:100,yoyo:true,repeat:1});
            }
        });
    }

    private drawCharacterHUD(container:Phaser.GameObjects.Container, type:string, isUser:boolean) {
        const combat=CombatManager.getInstance();
        const char=isUser?combat.user:combat.opponent; if(!char) return;
        const hudW=isUser?HUD.userWidth:HUD.opponentWidth;
        const hudH=isUser?HUD.userHeight:HUD.opponentHeight;
        const sf=this.scaleFactor;

        const glow=this.add.graphics(); glow.setAlpha(0); container.add(glow);
        if(isUser) this.userGlow=glow; else this.opponentGlow=glow;

        const bg=this.add.graphics();
        bg.fillStyle(0x000000,0.5); bg.fillRoundedRect(0,0,hudW,hudH,20*sf);
        bg.lineStyle(2,isUser?0x10b981:0xef4444,0.3); bg.strokeRoundedRect(0,0,hudW,hudH,20*sf);
        container.add(bg);
        this.updateGlow(glow,hudW,hudH,isUser?0x10b981:0xef4444);

        container.add(this.add.text(15*sf,15*sf,char.name.toUpperCase(),{fontFamily:'monospace',fontSize:`${this.fs(24)}px`,fontStyle:'bold',color:isUser?'#34d399':'#f87171'}));
        container.add(this.add.text(hudW-15*sf,15*sf,char.classType,{fontFamily:'monospace',fontSize:`${this.fs(22)}px`,color:'#ffffff'}).setOrigin(1,0).setAlpha(0.5));
        container.add(this.add.image(hudW-15*sf,45*sf,`shape_${char.linkedGem}`).setScale(2.5*sf).setOrigin(1,0));

        const barW=isUser?HUD.userBarWidth:HUD.opponentBarWidth;
        container.add(this.add.text(15*sf,55*sf,'HP',{fontSize:`${this.fs(15)}px`,color:'#ffffff'}).setAlpha(0.7));
        const hpTxt=this.add.text(15*sf+barW,55*sf,`${Math.floor(char.currentHp)}/${char.maxHp}`,{fontSize:`${this.fs(15)}px`,fontFamily:'monospace',color:'#ffffff'}).setOrigin(1,0).setAlpha(0.7);
        container.add(hpTxt);
        if(isUser) this.userHpText=hpTxt; else this.opponentHpText=hpTxt;
        const hpBar=this.add.graphics(); container.add(hpBar);
        if(isUser) this.userHpBar=hpBar; else this.opponentHpBar=hpBar;
        this.updateBar(hpBar,char.currentHp/char.maxHp,isUser?HUD.colors.hp:HUD.colors.opponentHp,barW,70*sf);

        container.add(this.add.text(15*sf,95*sf,'CHARGE',{fontSize:`${this.fs(15)}px`,color:'#ffffff'}).setAlpha(0.7));
        const chTxt=this.add.text(15*sf+barW,95*sf,`${Math.floor(char.currentCharge)}/${char.maxCharge}`,{fontSize:`${this.fs(15)}px`,fontFamily:'monospace',color:'#ffffff'}).setOrigin(1,0).setAlpha(0.7);
        container.add(chTxt);
        if(isUser) this.userChargeText=chTxt; else this.opponentChargeText=chTxt;
        const chBar=this.add.graphics(); container.add(chBar);
        if(isUser) this.userChargeBar=chBar; else this.opponentChargeBar=chBar;
        this.updateBar(chBar,char.currentCharge/char.maxCharge,isUser?HUD.colors.charge:HUD.colors.opponentCharge,barW,110*sf);

        // Stats – spacing adapts to available HUD width
        const statsCt=this.add.container(15*sf,145*sf);
        const ss={fontSize:`${this.fs(14)}px`,fontFamily:'monospace',color:'#aaaaaa'};
        const sv={fontSize:`${this.fs(14)}px`,fontFamily:'monospace',color:'#ffffff',fontStyle:'bold'};
        const colW=Math.min(68, Math.floor((hudW-100*sf)/6/sf));
        [{l:'STR',v:char.stats.strength},{l:'END',v:char.stats.endurance},{l:'PWR',v:char.stats.power},
         {l:'RES',v:char.stats.resistance},{l:'SPD',v:char.stats.speed},{l:'ACC',v:char.stats.accuracy}]
        .forEach((s,i)=>{
            statsCt.add(this.add.text(i*colW*sf,0,`${s.l}:`,ss));
            statsCt.add(this.add.text(i*colW*sf+22*sf,0,s.v.toString(),sv));
        });
        container.add(statsCt);

        if(!isUser) return;

        // Stack skill buttons
        const skillY=190*sf;
        const stacks=char.loadout.stacks||[];
        if(stacks.length===0) return;

        const pad=15*sf, spac=10*sf;
        const avail=hudW-(pad*2);
        let btnW=(avail-(stacks.length-1)*spac)/stacks.length;
        btnW=Math.max(128*sf,Math.min(200*sf,btnW));
        const totalW=stacks.length*btnW+(stacks.length-1)*spac;
        const overflow=totalW>avail;

        const skillListCt=this.add.container(0,0);
        container.add(skillListCt);

        if(overflow){
            const wX=container.x+pad, wY=container.y+skillY;
            const mg=this.make.graphics({x:0,y:0});
            mg.fillStyle(0xffffff); mg.fillRoundedRect(wX,wY,avail,60*sf,8*sf);
            skillListCt.setMask(mg.createGeometryMask());
            skillListCt.x=pad;
            skillListCt.setInteractive(new Phaser.Geom.Rectangle(0,skillY,totalW,60*sf),Phaser.Geom.Rectangle.Contains);
            this.input.setDraggable(skillListCt);
            skillListCt.on('drag',(_p:any,dragX:number)=>{skillListCt.x=Phaser.Math.Clamp(dragX,pad-(totalW-avail),pad);});
        } else {
            skillListCt.x=(hudW-totalW)/2;
        }

        stacks.forEach((skillId,i)=>{
            const btn=this.add.container(i*(btnW+spac),skillY);
            btn.setData('skillId',skillId);
            const bb=this.add.graphics();
            bb.fillStyle(0xffffff,0.1); bb.fillRoundedRect(0,0,btnW,40*sf,8*sf);
            btn.add(bb);
            const skill=CombatRegistry.getInstance().getSkill(skillId);
            if(skill){
                btn.add(this.add.image(10*sf,20*sf,skill.icon).setDisplaySize(24*sf,24*sf).setOrigin(0,0.5));
                let dn=skill.name;
                const maxC=Math.floor((btnW-65*sf)/(6*sf)); if(dn.length>maxC) dn=dn.substring(0,Math.max(0,maxC-3))+'...';
                btn.add(this.add.text(40*sf,20*sf,dn,{fontSize:`${this.fs(10)}px`,fontFamily:'monospace',color:'#ffffff'}).setOrigin(0,0.5));
                btn.add(this.add.text(btnW-10*sf,20*sf,`${skill.chargeCost}`,{fontSize:`${this.fs(10)}px`,fontFamily:'monospace',color:'#fbbf24',fontStyle:'bold'}).setOrigin(1,0.5));
            }
            btn.setInteractive(new Phaser.Geom.Rectangle(0,0,btnW,40*sf),Phaser.Geom.Rectangle.Contains);
            btn.on('pointerup',(ptr:Phaser.Input.Pointer)=>{
                if(Phaser.Math.Distance.Between(ptr.downX,ptr.downY,ptr.upX,ptr.upY)>10) return;
                const cm=CombatManager.getInstance(), u=cm.user;
                const sk=CombatRegistry.getInstance().getSkill(skillId);
                if(u&&sk&&u.currentCharge>=sk.chargeCost&&cm.currentTurn==='USER')
                    this.game.events.emit('SKILL_ACTIVATED',{character:'USER',skillId,moveScore:0,comboNumber:1,powerSurge:this.powerSurge});
                else if(u&&sk){
                    this.tweens.add({targets:btn,x:btn.x+5,duration:50,yoyo:true,repeat:3});
                    if(u.currentCharge<sk.chargeCost&&this.userChargeBar)
                        this.tweens.add({targets:this.userChargeBar,alpha:0.2,duration:100,yoyo:true,repeat:1});
                }
            });
            skillListCt.add(btn);
            this.skillButtons.push(btn);
        });
    }

    private updateBar(g:Phaser.GameObjects.Graphics,pct:number,color:number,width:number,y:number) {
        g.clear();
        g.fillStyle(0x000000,0.5); g.fillRoundedRect(15*this.scaleFactor,y,width,HUD.barHeight*this.scaleFactor,7*this.scaleFactor);
        g.fillStyle(color,1);
        if(pct>0) g.fillRoundedRect(15*this.scaleFactor,y,width*pct,HUD.barHeight*this.scaleFactor,7*this.scaleFactor);
    }

    private updateGlow(g:Phaser.GameObjects.Graphics,w:number,h:number,color:number){
        g.clear();
        for(let i=1;i<=10;i++){g.lineStyle(i*2*this.scaleFactor,color,0.1/i);g.strokeRoundedRect(-i*this.scaleFactor,-i*this.scaleFactor,w+i*2*this.scaleFactor,h+i*2*this.scaleFactor,20*this.scaleFactor+i*this.scaleFactor);}
        g.lineStyle(3*this.scaleFactor,color,0.5); g.strokeRoundedRect(0,0,w,h,20*this.scaleFactor);
    }

    // ─── Combat listeners ─────────────────────────────────────────────────────

    private setupCombatListeners(){
        this.game.events.on('HP_UPDATED',     this.handleHpUpdated,     this);
        this.game.events.on('CHARGE_UPDATED', this.handleChargeUpdated, this);
        this.game.events.on('POWER_UPDATE',   this.handlePowerUpdate,   this);
        this.game.events.on('TURN_SWITCHED',  this.handleTurnSwitched,  this);
        this.game.events.on('SKILL_EXECUTED', this.handleSkillExecuted, this);
        this.game.events.on('SKILL_MISSED',   this.handleSkillMissed,   this);
        this.game.events.on('GAME_OVER',      this.handleGameOver,      this);
    }

    private handleGameOver=(data:{winner:string})=>{
        if(this.isGameOver) return;
        this.isGameOver=true; this.isProcessing=true;
        const win=data.winner==='USER';
        const W=this.gameWidth,H=this.gameHeight;
        const ov=this.add.rectangle(0,0,W,H,0x000000,0.7).setOrigin(0); ov.setInteractive(); ov.setDepth(1000);
        const title=this.add.text(W/2,H/2-50*this.scaleFactor,win?'VICTORY!':'DEFEAT...',{fontFamily:'monospace',fontSize:`${this.fs(84)}px`,fontStyle:'bold',color:win?'#10b981':'#ef4444',stroke:'#ffffff',strokeThickness:8*this.scaleFactor}).setOrigin(0.5).setScale(0).setDepth(1001);
        const pLabel=this.add.text(W/2,H/2+50*this.scaleFactor,`Final Power: ${this.powerSurge}`,{fontFamily:'monospace',fontSize:`${this.fs(32)}px`,color:'#ffffff'}).setOrigin(0.5).setAlpha(0).setDepth(1001);
        const rBtn=this.add.container(W/2,H/2+150*this.scaleFactor); rBtn.setDepth(1001);
        const rb=this.add.rectangle(0,0,200*this.scaleFactor,60*this.scaleFactor,0xffffff,0.2).setStrokeStyle(2*this.scaleFactor,0xffffff);
        const rt=this.add.text(0,0,'RESTART',{fontFamily:'monospace',fontSize:`${this.fs(24)}px`,fontStyle:'bold',color:'#ffffff'}).setOrigin(0.5);
        rBtn.add([rb,rt]); rBtn.setSize(200*this.scaleFactor,60*this.scaleFactor); rBtn.setInteractive({useHandCursor:true}); rBtn.setAlpha(0);
        rBtn.on('pointerover',()=>rb.setFillStyle(0xffffff,0.4)); rBtn.on('pointerout',()=>rb.setFillStyle(0xffffff,0.2)); rBtn.on('pointerdown',()=>this.scene.restart());
        this.tweens.add({targets:title,scale:1,duration:800,ease:'Back.easeOut'});
        this.tweens.add({targets:[pLabel,rBtn],alpha:1,duration:500,delay:800});
    };

    private handleSkillMissed=(data:{skill:any,character:string})=>{
        const isUser=data.character==='USER';
        const x=this.gameWidth/2, y=isUser?this.gameHeight-200*this.scaleFactor:200*this.scaleFactor;
        const t=this.add.text(x,y,'MISSED!',{fontFamily:'monospace',fontSize:`${this.fs(48)}px`,fontStyle:'bold',color:'#ef4444',stroke:'#000000',strokeThickness:6*this.scaleFactor}).setOrigin(0.5);
        this.tweens.add({targets:t,y:y-100*this.scaleFactor,alpha:0,scale:1.5,duration:1000,ease:'Cubic.easeOut',onComplete:()=>t.destroy()});
    };

    private handleSkillExecuted=(data:{skill:any,character:string})=>{
        const isUser=data.character==='USER';
        const x=this.gameWidth/2, y=isUser?this.gameHeight-200*this.scaleFactor:200*this.scaleFactor;
        const t=this.add.text(x,y,data.skill.name.toUpperCase(),{fontFamily:'monospace',fontSize:`${this.fs(48)}px`,fontStyle:'bold',color:isUser?'#10b981':'#ef4444',stroke:'#000000',strokeThickness:6*this.scaleFactor}).setOrigin(0.5).setAlpha(0).setScale(0.5);
        this.tweens.add({targets:t,alpha:1,scale:1.2,duration:300,ease:'Back.easeOut',onComplete:()=>this.tweens.add({targets:t,alpha:0,y:y-50*this.scaleFactor,duration:500,delay:500,ease:'Power2',onComplete:()=>t.destroy()})});
    };

    private handleTurnSwitched=(turn:string)=>{
        const cm=CombatManager.getInstance();
        this.turnCountText.setText(cm.turnCount.toString());
        this.tweens.add({targets:this.userGlow,    alpha:turn==='USER'?1:0, duration:300});
        this.tweens.add({targets:this.opponentGlow,alpha:turn==='USER'?0:1, duration:300});
    };

    private handleHpUpdated=(data:any)=>{
        const isUser=data.character==='USER';
        const bar=isUser?this.userHpBar:this.opponentHpBar, txt=isUser?this.userHpText:this.opponentHpText;
        const color=isUser?HUD.colors.hp:HUD.colors.opponentHp, barW=isUser?HUD.userBarWidth:HUD.opponentBarWidth;
        this.updateBar(bar,data.hp/data.maxHp,color,barW,70*this.scaleFactor);
        if(txt) txt.setText(`${Math.floor(data.hp)}/${data.maxHp}`);
    };

    private handleChargeUpdated=(data:any)=>{
        const isUser=data.character==='USER';
        const bar=isUser?this.userChargeBar:this.opponentChargeBar, txt=isUser?this.userChargeText:this.opponentChargeText;
        const color=isUser?HUD.colors.charge:HUD.colors.opponentCharge, barW=isUser?HUD.userBarWidth:HUD.opponentBarWidth;
        this.updateBar(bar,data.charge/data.maxCharge,color,barW,110*this.scaleFactor);
        if(txt) txt.setText(`${Math.floor(data.charge)}/${data.maxCharge}`);
    };

    private handlePowerUpdate=(power:number)=>this.powerText.setText(power.toString());

    // ─── Grid helpers ─────────────────────────────────────────────────────────

    private getOffsetX() { return this.getCenteredX(GRID_SIZE*CELL_SIZE); }
    private getOffsetY() { return this.getCenteredY(GRID_SIZE*CELL_SIZE, -77*this.scaleFactor); }

    private initVisualGrid(ox:number,oy:number){
        for(let r=0;r<GRID_SIZE;r++){
            this.visualGrid[r]=[];
            for(let c=0;c<GRID_SIZE;c++){
                const cx=ox+c*CELL_SIZE+CELL_SIZE/2, cy=oy+r*CELL_SIZE+CELL_SIZE/2;
                const bg=this.add.circle(cx,cy,CELL_SIZE*0.4,0xffffff,0.03); bg.setBlendMode(Phaser.BlendModes.ADD);
                this.spawnVisualCell(r,c,ox,oy,this.logic.grid[r][c]!.shape);
            }
        }
    }

    private spawnVisualCell(r:number,c:number,ox:number,oy:number,shape:ShapeType){
        const x=ox+c*CELL_SIZE+CELL_SIZE/2, y=oy+r*CELL_SIZE+CELL_SIZE/2;
        const ct=this.add.container(x,y);
        ct.add(this.add.sprite(0,0,`shape_${shape}`));
        ct.setSize(CELL_SIZE,CELL_SIZE);
        this.visualGrid[r][c]={sprite:ct};
        return this.visualGrid[r][c];
    }

    public updateSelectionRect(r:number,c:number){
        if(this.isProcessing) return;
        if(CombatManager.getInstance().currentTurn!=='USER') return;
        const cell=this.visualGrid[r][c];
        if(cell){this.selectionRect.setPosition(cell.sprite.x,cell.sprite.y); this.selectionRect.setVisible(true);}
    }

    private setSpecial(r:number,c:number,type:SpecialType){
        const lc=this.logic.grid[r][c], vc=this.visualGrid[r][c];
        if(lc&&vc){
            lc.special=type;
            const ov=this.add.sprite(0,0,`special_${type}`);
            if(type!==SpecialType.PARASITE) ov.setBlendMode(Phaser.BlendModes.ADD);
            ov.setAlpha(0.9); vc.sprite.add(ov);
            this.tweens.add({targets:ov,scale:1.15,alpha:1,duration:600,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
        }
    }

    private spawnParticles(x:number,y:number,color:number){
        const e=this.add.particles(x,y,'particle',{speed:{min:50,max:150},angle:{min:0,max:360},scale:{start:1,end:0},alpha:{start:1,end:0},tint:color,lifespan:500,quantity:10,emitting:false});
        e.explode(); this.time.delayedCall(600,()=>e.destroy());
    }

    private spawnFloatingText(x:number,y:number,text:string){
        const t=this.add.text(x,y,text,{fontSize:'20px',fontFamily:'monospace',color:'#ffffff',fontStyle:'bold',stroke:'#000000',strokeThickness:3}).setOrigin(0.5);
        this.tweens.add({targets:t,y:y-40,alpha:0,duration:800,ease:'Power2',onComplete:()=>t.destroy()});
    }

    // ─── Swap & process board ────────────────────────────────────────────────

    public async swapCells(r1:number,c1:number,r2:number,c2:number){
        this.isProcessing=true;
        const v1=this.visualGrid[r1][c1],v2=this.visualGrid[r2][c2];
        const l1=this.logic.grid[r1][c1],l2=this.logic.grid[r2][c2];
        if(!v1||!v2||!l1||!l2){this.isProcessing=false;return;}

        await Promise.all([this.animateMove(v1.sprite,v2.sprite.x,v2.sprite.y),this.animateMove(v2.sprite,v1.sprite.x,v1.sprite.y)]);
        this.logic.swap(r1,c1,r2,c2);
        this.visualGrid[r1][c1]=v2; this.visualGrid[r2][c2]=v1;

        const n1=this.logic.grid[r1][c1]!, n2=this.logic.grid[r2][c2]!;

        if(n1.special===SpecialType.PARASITE||n2.special===SpecialType.PARASITE){
            const par=n1.special===SpecialType.PARASITE?n1:n2, oth=n1.special===SpecialType.PARASITE?n2:n1;
            await this.effectManager.handleParasiteCombination(par,oth,r2,c2);
            await this.processBoard(); CombatManager.getInstance().switchTurn(); this.isProcessing=false; return;
        }
        if(n1.special!==SpecialType.NONE&&n2.special!==SpecialType.NONE){
            await this.effectManager.handleSpecialCombination(n1,n2,r2,c2);
            await this.processBoard(); CombatManager.getInstance().switchTurn(); this.isProcessing=false; return;
        }

        const matches=this.logic.findMatches();
        if(matches.length===0){
            await Promise.all([this.animateMove(v1.sprite,v2.sprite.x,v2.sprite.y),this.animateMove(v2.sprite,v1.sprite.x,v1.sprite.y)]);
            this.logic.swap(r1,c1,r2,c2); this.visualGrid[r1][c1]=v1; this.visualGrid[r2][c2]=v2;
        } else {
            matches.forEach(m=>{if(m.specialCreation){
                const in1=m.cells.some(c=>c.r===r1&&c.c===c1), in2=m.cells.some(c=>c.r===r2&&c.c===c2);
                if(in2){m.specialCreation.r=r2;m.specialCreation.c=c2;}else if(in1){m.specialCreation.r=r1;m.specialCreation.c=c1;}
            }});
            await this.processBoard(true,matches);
            CombatManager.getInstance().switchTurn();
        }
        this.isProcessing=false;
    }

    private animateMove(obj:Phaser.GameObjects.Container,x:number,y:number,ease='Power2'){
        return new Promise<void>(resolve=>{
            const e=this.add.particles(0,0,'particle',{speed:{min:10,max:30},scale:{start:0.5,end:0},alpha:{start:0.5,end:0},lifespan:300,blendMode:'ADD',tint:0xffffff});
            e.startFollow(obj);
            this.tweens.add({targets:obj,x,y,duration:250,ease,onComplete:()=>{e.stop();this.time.delayedCall(300,()=>e.destroy());resolve();}});
        });
    }

    private pendingSpecials:LogicCell[]=[];

    public destroyCell(r:number,c:number,isSpecial:boolean,spawnPart:boolean=true,moveScore:number=10,combo:number=1):Promise<void>{
        return new Promise(resolve=>{
            const vc=this.visualGrid[r][c], lc=this.logic.grid[r][c];
            if(vc&&lc){
                if(isSpecial&&lc.special!==SpecialType.NONE){this.pendingSpecials.push({...lc});SoundManager.getInstance().play(SoundType.SPECIAL);}
                this.logic.grid[r][c]=null; this.visualGrid[r][c]=null;
                if(lc.shape!==ShapeType.NONE) this.game.events.emit('GEMS_DESTROYED',{shape:lc.shape,count:1,moveScore,comboNumber:combo,powerSurge:this.powerSurge});
                const x=this.getOffsetX()+c*CELL_SIZE+CELL_SIZE/2, y=this.getOffsetY()+r*CELL_SIZE+CELL_SIZE/2;
                if(spawnPart) this.spawnParticles(x,y,this.colors[lc.shape]);
                this.tweens.add({targets:vc.sprite,scale:1.2,duration:50,yoyo:true,onComplete:()=>this.tweens.add({targets:vc.sprite,scale:0,alpha:0,duration:150,onComplete:()=>{vc.sprite.destroy();resolve();}})});
            } else { resolve(); }
        });
    }

    private async processBoard(giveScore=true,initialMatches?:MatchResult[]){
        let matches=initialMatches||this.logic.findMatches();
        const hasEmpty=()=>this.logic.grid.some(row=>row.some(c=>c===null));
        let combo=1;
        while(matches.length>0||this.pendingSpecials.length>0||hasEmpty()){
            if(matches.length>0){
                SoundManager.getInstance().play(SoundType.MATCH);
                const toDestroy=new Map<string,number>();
                const specCreations:{r:number,c:number,type:SpecialType,shape:ShapeType}[]=[];
                matches.forEach(m=>{if(m.specialCreation)specCreations.push(m.specialCreation);m.cells.forEach(mc=>{const k=`${mc.r},${mc.c}`;toDestroy.set(k,Math.max(toDestroy.get(k)||0,m.score));});});
                const promises:Promise<void>[]=[];
                for(const[pos,base] of toDestroy.entries()){
                    const[r,c]=pos.split(',').map(Number);
                    const isST=specCreations.some(sc=>sc.r===r&&sc.c===c);
                    const ms=Math.round(base*Math.pow(1.1,combo-1));
                    if(giveScore){this.powerSurge+=ms;this.spawnFloatingText(this.getOffsetX()+c*CELL_SIZE+CELL_SIZE/2,this.getOffsetY()+r*CELL_SIZE+CELL_SIZE/2,`+${ms}`);}
                    const lc=this.logic.grid[r][c];
                    if(lc&&lc.shape!==ShapeType.NONE){
                        if(isST){this.game.events.emit('GEMS_DESTROYED',{shape:lc.shape,count:1,moveScore:ms,comboNumber:combo,powerSurge:this.powerSurge});if(lc.special!==SpecialType.NONE)this.pendingSpecials.push({...lc});}
                        else{promises.push(this.destroyCell(r,c,true,true,ms,combo));}
                    }
                }
                await Promise.all(promises);
                specCreations.forEach(sc=>{
                    const lc=this.logic.grid[sc.r][sc.c], vc=this.visualGrid[sc.r][sc.c];
                    if(!vc||!lc){this.logic.grid[sc.r][sc.c]={r:sc.r,c:sc.c,shape:sc.shape,special:SpecialType.NONE};this.spawnVisualCell(sc.r,sc.c,this.getOffsetX(),this.getOffsetY(),sc.shape);}
                    else if(lc.shape!==sc.shape){lc.shape=sc.shape;vc.sprite.destroy();this.visualGrid[sc.r][sc.c]=null;this.spawnVisualCell(sc.r,sc.c,this.getOffsetX(),this.getOffsetY(),sc.shape);}
                    this.setSpecial(sc.r,sc.c,sc.type);
                });
            }
            while(this.pendingSpecials.length>0){await this.effectManager.activateSpecial(this.pendingSpecials.shift()!);}
            await this.fillGrid();
            matches=this.logic.findMatches();
            if(matches.length>0) combo++;
        }
        this.game.events.emit('POWER_UPDATE',this.powerSurge);
        if(!this.logic.hasPossibleMoves()){console.log('No moves – shuffling');await this.shuffleBoard();}
    }

    public async shuffleBoard(){
        this.isProcessing=true;
        const ox=this.getOffsetX(), oy=this.getOffsetY();
        const dp:Promise<void>[]=[];
        for(let r=0;r<GRID_SIZE;r++)for(let c=0;c<GRID_SIZE;c++)if(this.visualGrid[r][c]){
            const vc=this.visualGrid[r][c]!;
            dp.push(new Promise(res=>this.tweens.add({targets:vc.sprite,scale:0,alpha:0,duration:200,onComplete:()=>{vc.sprite.destroy();res();}})));
            this.visualGrid[r][c]=null;
        }
        await Promise.all(dp);
        const updates=this.logic.shuffleBoard();
        const sp:Promise<void>[]=[];
        updates.forEach(u=>{
            const vc=this.spawnVisualCell(u.r,u.c,ox,oy,u.shape);
            if(u.special!==SpecialType.NONE) this.setSpecial(u.r,u.c,u.special);
            vc.sprite.scale=0; vc.sprite.alpha=0;
            sp.push(new Promise(res=>this.tweens.add({targets:vc.sprite,scale:1,alpha:1,duration:300,ease:'Back.easeOut',onComplete:()=>res()})));
        });
        await Promise.all(sp);
        this.isProcessing=false;
    }

    private async fillGrid(){
        const ox=this.getOffsetX(), oy=this.getOffsetY();
        const anim:Promise<void>[]=[];
        const{drops,newCells}=this.logic.applyGravity();
        drops.forEach(d=>{const vc=this.visualGrid[d.r][d.c]!;this.visualGrid[d.newR][d.c]=vc;this.visualGrid[d.r][d.c]=null;anim.push(this.animateMove(vc.sprite,ox+d.c*CELL_SIZE+CELL_SIZE/2,oy+d.newR*CELL_SIZE+CELL_SIZE/2,'Bounce.easeOut'));});
        newCells.forEach(nc=>{const vc=this.spawnVisualCell(nc.r,nc.c,ox,oy,nc.shape);vc.sprite.y-=GRID_SIZE*CELL_SIZE;anim.push(this.animateMove(vc.sprite,ox+nc.c*CELL_SIZE+CELL_SIZE/2,oy+nc.r*CELL_SIZE+CELL_SIZE/2,'Bounce.easeOut'));});
        await Promise.all(anim);
    }

    // ─── IEffectDelegate ─────────────────────────────────────────────────────

    private async activateSpecial(cell:LogicCell){await this.effectManager.activateSpecial(cell);}

    public playPulsarVisual(r:number,c:number,isH:boolean,isV:boolean,w:number){
        const cx=this.getOffsetX()+c*CELL_SIZE+CELL_SIZE/2, cy=this.getOffsetY()+r*CELL_SIZE+CELL_SIZE/2;
        const bcx=this.getOffsetX()+GRID_SIZE*CELL_SIZE/2, bcy=this.getOffsetY()+GRID_SIZE*CELL_SIZE/2;
        if(isH){const hb=this.add.rectangle(bcx,cy,GRID_SIZE*CELL_SIZE,CELL_SIZE*w,0x00ffff,0.5);hb.setBlendMode(Phaser.BlendModes.ADD);this.tweens.add({targets:hb,scaleY:0,alpha:0,duration:400,onComplete:()=>hb.destroy()});}
        if(isV){const vb=this.add.rectangle(cx,bcy,CELL_SIZE*w,GRID_SIZE*CELL_SIZE,0xff00ff,0.5);vb.setBlendMode(Phaser.BlendModes.ADD);this.tweens.add({targets:vb,scaleX:0,alpha:0,duration:400,onComplete:()=>vb.destroy()});}
    }

    public async playMissileVisual(r:number,c:number,tr:number,tc:number):Promise<void>{
        const sx=this.getOffsetX()+c*CELL_SIZE+CELL_SIZE/2, sy=this.getOffsetY()+r*CELL_SIZE+CELL_SIZE/2;
        const tx=this.getOffsetX()+tc*CELL_SIZE+CELL_SIZE/2, ty=this.getOffsetY()+tr*CELL_SIZE+CELL_SIZE/2;
        const m=this.add.sprite(sx,sy,'special_missile').setScale(0.5);
        m.setRotation(Phaser.Math.Angle.Between(sx,sy,tx,ty)+Math.PI/2);
        const p=this.add.particles(0,0,'particle',{speed:50,scale:{start:0.5,end:0},alpha:{start:1,end:0},tint:0xffaa00,lifespan:300,follow:m});
        return new Promise(res=>this.tweens.add({targets:m,x:tx,y:ty,duration:400,ease:'Cubic.easeIn',onComplete:()=>{p.stop();m.destroy();this.time.delayedCall(300,()=>p.destroy());res();}}));
    }

    public playBombVisual(r:number,c:number,radius:number){
        const cx=this.getOffsetX()+c*CELL_SIZE+CELL_SIZE/2, cy=this.getOffsetY()+r*CELL_SIZE+CELL_SIZE/2;
        const e=this.add.circle(cx,cy,CELL_SIZE*0.5,0xffaa00,0.8); e.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({targets:e,scale:radius*2.5,alpha:0,duration:500,ease:'Cubic.easeOut',onComplete:()=>e.destroy()});
    }

    public async playParasiteVortex(r:number,c:number,scale:number,duration:number):Promise<void>{
        const cx=this.getOffsetX()+c*CELL_SIZE+CELL_SIZE/2, cy=this.getOffsetY()+r*CELL_SIZE+CELL_SIZE/2;
        const v=this.add.sprite(cx,cy,'special_parasite').setScale(0);
        return new Promise(res=>this.tweens.add({targets:v,scale,angle:duration>800?1080:720,alpha:0,duration,ease:duration>800?'Cubic.easeIn':'Cubic.easeOut',onComplete:()=>{v.destroy();res();}}));
    }

    public async playParasiteVisual(r:number,c:number,_tShape:ShapeType,targetCells:{r:number,c:number}[]):Promise<void>{
        const cx=this.getOffsetX()+c*CELL_SIZE+CELL_SIZE/2, cy=this.getOffsetY()+r*CELL_SIZE+CELL_SIZE/2;
        if(targetCells.length===0){await new Promise(res=>this.time.delayedCall(400,res));return;}
        await Promise.all(targetCells.map(cell=>{
            const tx=this.getOffsetX()+cell.c*CELL_SIZE+CELL_SIZE/2, ty=this.getOffsetY()+cell.r*CELL_SIZE+CELL_SIZE/2;
            const beam=this.add.line(0,0,cx,cy,tx,ty,0xd946ef,0.8).setOrigin(0).setLineWidth(4);
            const pt=this.add.sprite(cx,cy,'particle').setTint(0xd946ef).setScale(2);
            return new Promise<void>(res=>this.tweens.add({targets:pt,x:tx,y:ty,duration:400,ease:'Power2',onComplete:()=>{pt.destroy();beam.destroy();res();}}));
        }));
    }

    public shakeCamera(d:number,i:number){this.cameras.main.shake(d,i);}
    public getGridSize(){return this.logic.gridSize;}
    public getGrid(){return this.logic.grid;}

    // ─── Shutdown ─────────────────────────────────────────────────────────────

    shutdown(){
        if(this.opponentAI){this.opponentAI.destroy();this.opponentAI=null;}
        ['HP_UPDATED','CHARGE_UPDATED','POWER_UPDATE','TURN_SWITCHED','SKILL_EXECUTED','SKILL_MISSED','GAME_OVER']
            .forEach(ev=>this.game.events.off(ev,undefined,this));
    }
}
