import React, { useState, useEffect, useCallback, useRef } from 'react';

// 난이도 설정
const DIFFICULTIES = {
  beginner: { rows: 9, cols: 9, mines: 10, name: '초급' },
  intermediate: { rows: 16, cols: 16, mines: 40, name: '중급' },
  expert: { rows: 16, cols: 30, mines: 99, name: '고급' }
};

// 주변 지뢰 개수에 따른 숫자 색상
const NUMBER_COLORS = {
  1: 'text-blue-600',
  2: 'text-green-600',
  3: 'text-red-600',
  4: 'text-purple-800',
  5: 'text-red-900',
  6: 'text-teal-600',
  7: 'text-black',
  8: 'text-gray-600'
};

export default function App() {
  const [difficulty, setDifficulty] = useState('beginner');
  const [board, setBoard] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle', 'playing', 'won', 'lost'
  const [flagsCount, setFlagsCount] = useState(0);
  const [time, setTime] = useState(0);
  const [firstClick, setFirstClick] = useState(true);
  
  // 모바일/터치 환경을 위한 조작 모드 (파기 vs 깃발 꽂기)
  const [interactionMode, setInteractionMode] = useState('dig');

  // 🎵 사운드 관련 상태 및 Ref
  const [isBgmPlaying, setIsBgmPlaying] = useState(false);
  const [isSfxEnabled, setIsSfxEnabled] = useState(true);
  const bgmRef = useRef(null);

  // 🎵 배경음악 재생 제어
  useEffect(() => {
    if (bgmRef.current) {
      if (isBgmPlaying) {
        bgmRef.current.play().catch(e => console.log("브라우저 자동재생 정책 차단", e));
      } else {
        bgmRef.current.pause();
      }
    }
  }, [isBgmPlaying]);

  // 🔊 효과음 생성기 (Web Audio API - 외부 파일 없이 소리 생성!)
  const playSound = useCallback((type) => {
    if (!isSfxEnabled) return;
    
    if (!window.audioCtx) {
      window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = window.audioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'dig') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'flag') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.linearRampToValueAtTime(800, now + 0.1);
      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.linearRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'mine') {
      const bufferSize = ctx.sampleRate * 0.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 0.5);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(1, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
    } else if (type === 'win') {
      const freqs = [440, 554, 659, 880];
      freqs.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.1, now + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.1);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now + i * 0.1);
        o.stop(now + i * 0.1 + 0.1);
      });
    }
  }, [isSfxEnabled]);

  // 보드 복사 헬퍼 함수
  const copyBoard = (b) => b.map(row => row.map(cell => ({ ...cell })));

  // 게임 초기화
  const initBoard = useCallback((diffKey) => {
    const { rows, cols } = DIFFICULTIES[diffKey];
    const newBoard = Array(rows).fill(null).map((_, r) =>
      Array(cols).fill(null).map((_, c) => ({
        row: r, col: c,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        neighborMines: 0,
        exploded: false,
        causedLoss: false
      }))
    );
    setBoard(newBoard);
    setStatus('idle');
    setFlagsCount(0);
    setTime(0);
    setFirstClick(true);
  }, []);

  // 초기 렌더링 및 난이도 변경 시 초기화
  useEffect(() => {
    initBoard(difficulty);
  }, [difficulty, initBoard]);

  // 타이머 로직
  useEffect(() => {
    let timer;
    if (status === 'playing') {
      timer = setInterval(() => {
        setTime(prev => Math.min(prev + 1, 999));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  // 첫 클릭 시 지뢰 배치
  const placeMines = (startRow, startCol, currentBoard) => {
    const { rows, cols, mines } = DIFFICULTIES[difficulty];
    let minesPlaced = 0;

    while (minesPlaced < mines) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      
      if (!currentBoard[r][c].isMine && !(r === startRow && c === startCol)) {
        currentBoard[r][c].isMine = true;
        minesPlaced++;
      }
    }

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (!currentBoard[i][j].isMine) {
          let count = 0;
          for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
              const ni = i + di;
              const nj = j + dj;
              if (ni >= 0 && ni < rows && nj >= 0 && nj < cols && currentBoard[ni][nj].isMine) {
                count++;
              }
            }
          }
          currentBoard[i][j].neighborMines = count;
        }
      }
    }
  };

  // 빈 칸(0) 연속 열기
  const revealEmptyCells = (startRow, startCol, b) => {
    const { rows, cols } = DIFFICULTIES[difficulty];
    const stack = [[startRow, startCol]];

    while (stack.length > 0) {
      const [r, c] = stack.pop();
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;

      const cell = b[r][c];
      if (cell.isRevealed || cell.isFlagged || cell.isMine) continue;

      cell.isRevealed = true;

      if (cell.neighborMines === 0) {
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            stack.push([r + di, c + dj]);
          }
        }
      }
    }
  };

  // 승리 조건 체크
  const checkWin = (b) => {
    const { rows, cols, mines } = DIFFICULTIES[difficulty];
    let revealedCount = 0;
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (b[r][c].isRevealed) revealedCount++;
      }
    }

    if (revealedCount === (rows * cols) - mines) {
      setStatus('won');
      playSound('win');
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (b[r][c].isMine) {
            b[r][c].isFlagged = true;
          }
        }
      }
      setFlagsCount(mines);
    } else {
      playSound('dig');
    }
  };

  // 셀 좌클릭
  const handleLeftClick = (r, c) => {
    if (status === 'won' || status === 'lost') return;
    
    const newBoard = copyBoard(board);
    const cell = newBoard[r][c];

    if (cell.isRevealed || cell.isFlagged) return;

    if (firstClick) {
      placeMines(r, c, newBoard);
      setFirstClick(false);
      setStatus('playing');
    }

    if (newBoard[r][c].isMine) {
      cell.causedLoss = true;
      playSound('mine');
      
      const { rows, cols } = DIFFICULTIES[difficulty];
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (newBoard[i][j].isMine && !newBoard[i][j].isFlagged) {
            newBoard[i][j].isRevealed = true;
          } else if (!newBoard[i][j].isMine && newBoard[i][j].isFlagged) {
            newBoard[i][j].exploded = true; 
          }
        }
      }
      setBoard(newBoard);
      setStatus('lost');
      return;
    }

    revealEmptyCells(r, c, newBoard);
    setBoard(newBoard);
    checkWin(newBoard);
  };

  // 셀 우클릭 (깃발)
  const handleRightClick = (e, r, c) => {
    if (e) e.preventDefault();
    if (status === 'won' || status === 'lost') return;

    const newBoard = copyBoard(board);
    const cell = newBoard[r][c];

    if (cell.isRevealed) return;

    cell.isFlagged = !cell.isFlagged;
    playSound('flag');
    setFlagsCount(prev => cell.isFlagged ? prev + 1 : prev - 1);
    setBoard(newBoard);
  };

  // 통합 클릭 핸들러
  const handleCellClick = (e, r, c) => {
    if (interactionMode === 'flag') {
      handleRightClick(null, r, c);
    } else {
      handleLeftClick(r, c);
    }
  };

  // 상태에 따른 스마일리
  const getSmiley = () => {
    if (status === 'won') return '😎';
    if (status === 'lost') return '😵';
    return '😐';
  };

  // 숫자 포맷팅
  const formatNumber = (num) => {
    const parsed = Math.max(-99, Math.min(999, num));
    const isNegative = parsed < 0;
    const absStr = Math.abs(parsed).toString().padStart(isNegative ? 2 : 3, '0');
    return isNegative ? `-${absStr}` : absStr;
  };

  const minesLeft = DIFFICULTIES[difficulty].mines - flagsCount;

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4 font-sans text-neutral-800">
      
      {/* 🎵 HTML 오디오 태그 (배경음악) */}
      <audio 
        ref={bgmRef} 
        src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
        loop 
      />

      {/* 헤더 및 설정 영역 */}
      <div className="mb-6 text-center w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-white mb-4">지뢰찾기</h1>
        
        {/* 난이도 & 다시하기 버튼 그룹 */}
        <div className="flex flex-wrap gap-2 justify-center mb-4">
          {Object.entries(DIFFICULTIES).map(([key, data]) => (
            <button
              key={key}
              onClick={() => {
                setDifficulty(key);
                initBoard(key);
              }}
              className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                difficulty === key 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
            >
              {data.name}
            </button>
          ))}
          
          {/* 🔥 새로 추가된 직관적인 다시하기 버튼 */}
          <button
            onClick={() => initBoard(difficulty)}
            className="ml-2 px-4 py-2 rounded-md font-bold bg-yellow-500 text-yellow-900 shadow-lg hover:bg-yellow-400 transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            다시하기
          </button>
        </div>

        {/* 🔊 사운드 컨트롤 버튼 */}
        <div className="flex gap-3 justify-center">
          <button 
            onClick={() => setIsBgmPlaying(!isBgmPlaying)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-colors ${
              isBgmPlaying ? 'border-green-500 text-green-400 bg-green-900/30' : 'border-neutral-600 text-neutral-500'
            }`}
          >
            {isBgmPlaying ? '🎵 BGM 켜짐' : '🔇 BGM 꺼짐'}
          </button>
          <button 
            onClick={() => setIsSfxEnabled(!isSfxEnabled)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-colors ${
              isSfxEnabled ? 'border-blue-500 text-blue-400 bg-blue-900/30' : 'border-neutral-600 text-neutral-500'
            }`}
          >
            {isSfxEnabled ? '🔊 효과음 켜짐' : '🔈 효과음 꺼짐'}
          </button>
        </div>
      </div>

      {/* 게임 보드 */}
      <div className="bg-neutral-300 p-4 rounded-xl shadow-2xl border-4 border-neutral-400 select-none">
        {/* 상단 전광판 */}
        <div className="flex justify-between items-center bg-neutral-800 p-3 rounded-lg border-4 border-neutral-700 mb-4 border-t-neutral-900 border-l-neutral-900">
          <div className="text-red-500 font-mono text-3xl tracking-widest bg-black px-2 py-1 rounded shadow-inner">
            {formatNumber(minesLeft)}
          </div>
          <button 
            onClick={() => initBoard(difficulty)}
            className="text-4xl hover:scale-110 active:scale-95 transition-transform drop-shadow-md bg-neutral-300 border-4 border-t-white border-l-white border-b-neutral-500 border-r-neutral-500 rounded p-1"
            title="다시하기"
          >
            {getSmiley()}
          </button>
          <div className="text-red-500 font-mono text-3xl tracking-widest bg-black px-2 py-1 rounded shadow-inner">
            {formatNumber(time)}
          </div>
        </div>

        {/* 그리드 */}
        <div className="overflow-x-auto max-w-[95vw] lg:max-w-none pb-2">
          <div 
            className="grid gap-[1px] bg-neutral-500 border-2 border-neutral-600 p-[1px] w-max mx-auto"
            style={{ gridTemplateColumns: `repeat(${DIFFICULTIES[difficulty].cols}, max-content)` }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {board.map((row, r) => 
              row.map((cell, c) => {
                let cellClass = "w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-xl font-bold ";
                
                if (!cell.isRevealed) {
                  cellClass += "bg-neutral-300 border-[3px] border-t-white border-l-white border-b-neutral-500 border-r-neutral-500 hover:bg-neutral-200 cursor-pointer";
                } else {
                  if (cell.causedLoss) {
                    cellClass += "bg-red-500 border-[1px] border-neutral-400";
                  } else {
                    cellClass += "bg-neutral-200 border-[1px] border-neutral-400";
                  }
                }

                return (
                  <div
                    key={`${r}-${c}`}
                    className={cellClass}
                    onClick={(e) => handleCellClick(e, r, c)}
                    onContextMenu={(e) => handleRightClick(e, r, c)}
                  >
                    {cell.isRevealed ? (
                      cell.isMine ? '💣' : 
                      cell.exploded ? '❌' : 
                      cell.neighborMines > 0 ? (
                        <span className={NUMBER_COLORS[cell.neighborMines] || 'text-black'}>
                          {cell.neighborMines}
                        </span>
                      ) : ''
                    ) : (
                      cell.isFlagged ? '🚩' : ''
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 모바일 조작 모드 토글 */}
      <div className="mt-8 flex gap-4 bg-neutral-800 p-2 rounded-full border border-neutral-700">
        <button 
          onClick={() => setInteractionMode('dig')}
          className={`px-6 py-2 rounded-full font-bold transition-colors ${
            interactionMode === 'dig' ? 'bg-blue-500 text-white shadow-lg' : 'text-neutral-400 hover:text-white'
          }`}
        >
          ⛏️ 파기
        </button>
        <button 
          onClick={() => setInteractionMode('flag')}
          className={`px-6 py-2 rounded-full font-bold transition-colors ${
            interactionMode === 'flag' ? 'bg-red-500 text-white shadow-lg' : 'text-neutral-400 hover:text-white'
          }`}
        >
          🚩 깃발
        </button>
      </div>

      {/* 게임 종료 안내 */}
      {(status === 'won' || status === 'lost') && (
        <div className={`mt-6 text-2xl font-black ${status === 'won' ? 'text-green-400' : 'text-red-500'} animate-bounce`}>
          {status === 'won' ? '🎉 승리했습니다! 🎉' : '💥 지뢰를 밟았습니다! 💥'}
        </div>
      )}

    </div>
  );
}